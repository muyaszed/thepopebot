import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { PROJECT_ROOT, clusterDataDir } from '../paths.js';
import { inspectContainer, stopContainer as dockerStopContainer } from '../tools/docker.js';
import { getWorkerWithClusterAndRole } from '../db/clusters.js';

/**
 * Sanitize a string for use in Docker project/container names.
 * @param {string} str
 * @returns {string}
 */
function sanitizeName(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Compute naming for a cluster's Docker resources.
 * @param {object} cluster
 * @returns {{ project: string, dataDir: string }}
 */
export function clusterNaming(cluster) {
  const shortId = cluster.id.replace(/-/g, '').slice(0, 8);
  const project = `cluster-${sanitizeName(cluster.name)}-${shortId}`;
  return { project, dataDir: path.join(clusterDataDir, project) };
}

/**
 * Compute the container name for a worker.
 * @param {string} project - Docker Compose project name
 * @param {number} replicaIndex
 * @returns {string}
 */
function workerContainerName(project, replicaIndex) {
  return `${project}-worker-${replicaIndex}`;
}

/**
 * Check if a worker's container is currently running.
 * @param {string} containerName
 * @returns {Promise<boolean>}
 */
async function isContainerRunning(containerName) {
  try {
    const info = await inspectContainer(containerName);
    return info?.State?.Running === true;
  } catch {
    return false;
  }
}

/**
 * Create cluster and worker folders on the host filesystem.
 * @param {object} cluster - Cluster record (with parsed folders)
 * @param {object[]} workers - Worker records (with parsed folders)
 * @param {string} dataDir - Cluster data directory path
 */
export function ensureClusterFolders(cluster, workers, dataDir) {
  // Create cluster-level shared folders
  const clusterFolders = cluster.folders ? (typeof cluster.folders === 'string' ? JSON.parse(cluster.folders) : cluster.folders) : [];
  for (const folder of clusterFolders) {
    fs.mkdirSync(path.join(dataDir, 'shared', folder), { recursive: true });
  }

  // Create worker-level folders
  for (const worker of workers) {
    const workerFolders = worker.folders ? (typeof worker.folders === 'string' ? JSON.parse(worker.folders) : worker.folders) : [];
    for (const folder of workerFolders) {
      fs.mkdirSync(path.join(dataDir, `worker-${worker.replicaIndex}`, folder), { recursive: true });
    }
  }
}

/**
 * Stop a worker's Docker container.
 * @param {string} workerId
 */
export async function stopWorkerContainer(workerId) {
  const worker = getWorkerWithClusterAndRole(workerId);
  if (!worker || !worker.cluster) return;

  const { project } = clusterNaming(worker.cluster);
  const containerName = workerContainerName(project, worker.replicaIndex);
  await dockerStopContainer(containerName);
}

/**
 * Execute a cluster worker by launching an ephemeral headless container.
 * @param {string} workerId
 * @param {'cron'|'webhook'|'manual'|'file_watch'} triggerType
 * @param {object} [context] - Optional context (e.g. webhook payload)
 * @returns {Promise<{ busy: boolean, containerName?: string, error?: string }>}
 */
export async function executeWorker(workerId, triggerType, context = {}) {
  const worker = getWorkerWithClusterAndRole(workerId);
  if (!worker || !worker.cluster) {
    return { busy: false, error: 'Worker or cluster not found' };
  }

  const { cluster, role } = worker;
  const { project, dataDir } = clusterNaming(cluster);
  const containerName = workerContainerName(project, worker.replicaIndex);

  // Busy check
  if (await isContainerRunning(containerName)) {
    console.log(`[cluster] Worker ${worker.name} (${containerName}) is busy, skipping`);
    return { busy: true, containerName };
  }

  // Ensure data dir and folders exist
  fs.mkdirSync(dataDir, { recursive: true });
  ensureClusterFolders(cluster, [worker], dataDir);

  // Build task prompt
  const parts = [];
  if (cluster.systemPrompt) parts.push(cluster.systemPrompt);
  if (role?.role) parts.push(`Your role: ${role.roleName}\n\n${role.role}`);
  parts.push(`Trigger: ${triggerType}`);
  if (context.payload) parts.push(`Webhook payload:\n${JSON.stringify(context.payload, null, 2)}`);
  const taskPrompt = parts.join('\n\n---\n\n');

  // Build feature branch name
  const timestamp = Date.now().toString(36);
  const featureBranch = `cluster/${sanitizeName(cluster.name)}/worker-${worker.replicaIndex}-${timestamp}`;

  // Compose file path
  const composeFile = path.join(PROJECT_ROOT, 'docker-compose.cluster.yml');

  // Build env flags
  const repo = process.env.GH_REPO || '';
  const branch = process.env.GH_DEFAULT_BRANCH || 'main';

  const envFlags = [
    `-e REPLICA_INDEX=${worker.replicaIndex}`,
    `-e REPO=${repo}`,
    `-e BRANCH=${branch}`,
    `-e FEATURE_BRANCH=${featureBranch}`,
    `-e HEADLESS_TASK=${shellEscape(taskPrompt)}`,
  ];

  const cmd = [
    'docker compose',
    `-p ${shellEscape(project)}`,
    `-f ${shellEscape(composeFile)}`,
    'run --rm',
    `--name ${shellEscape(containerName)}`,
    ...envFlags,
    `-v ${shellEscape(dataDir)}:/home/claude-code/workspace`,
    'worker',
  ].join(' ');

  console.log(`[cluster] Launching worker ${worker.name} (${containerName}) via ${triggerType}`);

  // Fire and forget for cron/webhook/file_watch, blocking for manual
  if (triggerType === 'manual') {
    return new Promise((resolve) => {
      exec(cmd, { timeout: 30 * 60 * 1000 }, (error, stdout, stderr) => {
        if (error) {
          console.error(`[cluster] Worker ${containerName} failed:`, error.message);
          resolve({ busy: false, containerName, error: error.message });
        } else {
          console.log(`[cluster] Worker ${containerName} completed`);
          resolve({ busy: false, containerName });
        }
      });
    });
  }

  // Non-blocking for cron/webhook/file_watch
  const child = exec(cmd, { timeout: 30 * 60 * 1000 });
  child.stdout?.on('data', (data) => console.log(`[cluster:${containerName}] ${data.trim()}`));
  child.stderr?.on('data', (data) => console.error(`[cluster:${containerName}] ${data.trim()}`));
  child.on('close', (code) => {
    console.log(`[cluster] Worker ${containerName} exited with code ${code}`);
  });

  return { busy: false, containerName };
}

/**
 * Check if a specific worker is currently running.
 * @param {string} workerId
 * @returns {Promise<boolean>}
 */
export async function isWorkerRunning(workerId) {
  const worker = getWorkerWithClusterAndRole(workerId);
  if (!worker || !worker.cluster) return false;

  const { project } = clusterNaming(worker.cluster);
  const containerName = workerContainerName(project, worker.replicaIndex);
  return isContainerRunning(containerName);
}

/**
 * Escape a string for safe use in shell commands.
 * @param {string} str
 * @returns {string}
 */
function shellEscape(str) {
  return `'${str.replace(/'/g, "'\\''")}'`;
}
