import cron from 'node-cron';
import { getAllWorkersWithTriggers, getWorkerWithClusterAndRole } from '../db/clusters.js';
import { executeWorker } from './execute.js';
import { clusterDataDir } from '../paths.js';
import path from 'path';

// ── In-memory state ──────────────────────────────────────────────
let _cronTasks = [];               // [{ workerId, task }]
let _webhookWorkerIds = new Set(); // worker IDs with webhook: true
let _fileWatchers = [];            // [{ workerId, watcher }]

// ── Boot & Reload ────────────────────────────────────────────────

/**
 * Start the cluster runtime — schedule crons and register webhook worker IDs.
 * Called once at boot from instrumentation.js.
 */
export function startClusterRuntime() {
  try {
    loadWorkers();
    console.log('[cluster] Runtime started');
  } catch (err) {
    console.error('[cluster] Failed to start runtime:', err.message);
  }
}

/**
 * Stop all crons, clear webhooks, close file watchers, and re-load from DB.
 * Called when workers/triggers are updated via UI.
 */
export function reloadClusterRuntime() {
  // Stop existing crons
  for (const { task } of _cronTasks) {
    task.stop();
  }
  _cronTasks = [];
  _webhookWorkerIds = new Set();

  // Close file watchers
  for (const { watcher } of _fileWatchers) {
    watcher.close();
  }
  _fileWatchers = [];

  try {
    loadWorkers();
    console.log('[cluster] Runtime reloaded');
  } catch (err) {
    console.error('[cluster] Failed to reload runtime:', err.message);
  }
}

/**
 * Load all workers with trigger configs from DB and set up crons/webhooks/file watchers.
 */
function loadWorkers() {
  const workers = getAllWorkersWithTriggers();
  let cronCount = 0;
  let webhookCount = 0;
  let fileWatchCount = 0;

  for (const worker of workers) {
    const config = worker.triggerConfig;
    if (!config) continue;

    // Cron trigger
    if (config.cron && config.cron.enabled && config.cron.schedule) {
      const schedule = config.cron.schedule;
      if (!cron.validate(schedule)) {
        console.warn(`[cluster] Invalid cron schedule for worker ${worker.id}: ${schedule}`);
        continue;
      }
      const task = cron.schedule(schedule, () => {
        executeWorker(worker.id, 'cron').catch((err) => {
          console.error(`[cluster] Cron execution failed for worker ${worker.id}:`, err.message);
        });
      });
      _cronTasks.push({ workerId: worker.id, task });
      cronCount++;
    }

    // Webhook trigger
    if (config.webhook && config.webhook.enabled) {
      _webhookWorkerIds.add(worker.id);
      webhookCount++;
    }

    // File watch trigger
    if (config.file_watch && config.file_watch.enabled && config.file_watch.paths) {
      setupFileWatch(worker);
      fileWatchCount++;
    }
  }

  if (cronCount > 0 || webhookCount > 0 || fileWatchCount > 0) {
    console.log(`[cluster] Loaded ${cronCount} cron(s), ${webhookCount} webhook(s), ${fileWatchCount} file watcher(s)`);
  }
}

/**
 * Set up a chokidar file watcher for a worker.
 * @param {object} worker - Worker record with parsed triggerConfig and cluster info
 */
async function setupFileWatch(worker) {
  let chokidar;
  try {
    chokidar = await import('chokidar');
  } catch {
    console.warn(`[cluster] chokidar not installed, skipping file watch for worker ${worker.id}`);
    return;
  }

  const fullWorker = getWorkerWithClusterAndRole(worker.id);
  if (!fullWorker?.cluster) return;

  const { clusterNaming } = await import('./execute.js');
  const { dataDir } = clusterNaming(fullWorker.cluster);

  const paths = worker.triggerConfig.file_watch.paths
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => path.join(dataDir, p));

  if (paths.length === 0) return;

  let debounceTimer = null;
  const watcher = chokidar.watch(paths, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 500 },
  });

  watcher.on('add', () => debouncedTrigger());
  watcher.on('change', () => debouncedTrigger());

  function debouncedTrigger() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      executeWorker(worker.id, 'file_watch').catch((err) => {
        console.error(`[cluster] File watch execution failed for worker ${worker.id}:`, err.message);
      });
    }, 1000);
  }

  _fileWatchers.push({ workerId: worker.id, watcher });
  console.log(`[cluster] File watcher started for worker ${worker.id}: ${paths.join(', ')}`);
}

// ── Webhook Handler ──────────────────────────────────────────────

/**
 * Handle an incoming webhook request for a cluster worker.
 * @param {string} workerId - Worker UUID
 * @param {Request} request - Incoming request
 * @returns {Promise<Response>}
 */
export async function handleClusterWebhook(workerId, request) {
  if (!_webhookWorkerIds.has(workerId)) {
    return Response.json({ error: 'Worker not found or webhook not enabled' }, { status: 404 });
  }

  let payload = {};
  try {
    payload = await request.json();
  } catch {
    // No body is fine
  }

  const result = await executeWorker(workerId, 'webhook', { payload });

  if (result.busy) {
    return Response.json({ busy: true, containerName: result.containerName }, { status: 409 });
  }

  if (result.error) {
    return Response.json({ error: result.error }, { status: 500 });
  }

  return Response.json({ ok: true, containerName: result.containerName });
}
