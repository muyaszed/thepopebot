'use server';

import fs from 'fs';
import path from 'path';
import { auth } from '../auth/index.js';
import {
  createCluster as dbCreateCluster,
  getClusterById,
  getClustersByUser,
  updateClusterName as dbUpdateClusterName,
  updateClusterSystemPrompt as dbUpdateClusterSystemPrompt,
  updateClusterFolders as dbUpdateClusterFolders,
  toggleClusterStarred as dbToggleClusterStarred,
  deleteCluster as dbDeleteCluster,
  createClusterRole as dbCreateClusterRole,
  getClusterRoleById,
  getClusterRolesByUser,
  updateClusterRole as dbUpdateClusterRole,
  deleteClusterRole as dbDeleteClusterRole,
  createClusterWorker as dbCreateClusterWorker,
  getClusterWorkersByCluster,
  updateClusterWorkerRoleId as dbUpdateClusterWorkerRoleId,
  updateClusterWorkerName as dbUpdateClusterWorkerName,
  updateWorkerTriggerConfig as dbUpdateWorkerTriggerConfig,
  updateWorkerFolders as dbUpdateWorkerFolders,
  deleteClusterWorker as dbDeleteClusterWorker,
} from '../db/clusters.js';

async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }
  return session.user;
}

// ── Clusters ──────────────────────────────────────────────

export async function getClusters() {
  const user = await requireAuth();
  return getClustersByUser(user.id);
}

export async function getCluster(clusterId) {
  const user = await requireAuth();
  const cluster = getClusterById(clusterId);
  if (!cluster || cluster.userId !== user.id) return null;
  const workers = getClusterWorkersByCluster(clusterId).map((w) => ({
    ...w,
    triggerConfig: w.triggerConfig ? JSON.parse(w.triggerConfig) : null,
    folders: w.folders ? JSON.parse(w.folders) : null,
  }));
  return {
    ...cluster,
    folders: cluster.folders ? JSON.parse(cluster.folders) : null,
    workers,
  };
}

export async function createCluster(name = 'New Cluster') {
  const user = await requireAuth();
  return dbCreateCluster(user.id, { name });
}

export async function renameCluster(clusterId, name) {
  const user = await requireAuth();
  const cluster = getClusterById(clusterId);
  if (!cluster || cluster.userId !== user.id) return { success: false };
  dbUpdateClusterName(clusterId, name);
  return { success: true };
}

export async function starCluster(clusterId) {
  const user = await requireAuth();
  const cluster = getClusterById(clusterId);
  if (!cluster || cluster.userId !== user.id) return { success: false };
  const starred = dbToggleClusterStarred(clusterId);
  return { success: true, starred };
}

export async function updateClusterSystemPrompt(clusterId, systemPrompt) {
  const user = await requireAuth();
  const cluster = getClusterById(clusterId);
  if (!cluster || cluster.userId !== user.id) return { success: false };
  dbUpdateClusterSystemPrompt(clusterId, systemPrompt);
  return { success: true };
}

export async function updateClusterFolders(clusterId, folders) {
  const user = await requireAuth();
  const cluster = getClusterById(clusterId);
  if (!cluster || cluster.userId !== user.id) return { success: false };
  dbUpdateClusterFolders(clusterId, folders);
  return { success: true };
}

export async function updateWorkerFoldersAction(workerId, folders) {
  await requireAuth();
  dbUpdateWorkerFolders(workerId, folders);
  return { success: true };
}

export async function deleteCluster(clusterId) {
  const user = await requireAuth();
  const cluster = getClusterById(clusterId);
  if (!cluster || cluster.userId !== user.id) return { success: false };
  dbDeleteCluster(clusterId);
  return { success: true };
}

// ── Cluster Roles ─────────────────────────────────────────

export async function getClusterRoles() {
  const user = await requireAuth();
  return getClusterRolesByUser(user.id);
}

export async function createClusterRole(roleName, role = '') {
  const user = await requireAuth();
  return dbCreateClusterRole(user.id, { roleName, role });
}

export async function updateClusterRole(roleId, { roleName, role }) {
  const user = await requireAuth();
  const existing = getClusterRoleById(roleId);
  if (!existing || existing.userId !== user.id) return { success: false };
  dbUpdateClusterRole(roleId, { roleName, role });
  return { success: true };
}

export async function deleteClusterRole(roleId) {
  const user = await requireAuth();
  const existing = getClusterRoleById(roleId);
  if (!existing || existing.userId !== user.id) return { success: false };
  dbDeleteClusterRole(roleId);
  return { success: true };
}

// ── Cluster Workers ───────────────────────────────────────

export async function addClusterWorker(clusterId, clusterRoleId = null) {
  const user = await requireAuth();
  const cluster = getClusterById(clusterId);
  if (!cluster || cluster.userId !== user.id) return { success: false };
  const worker = dbCreateClusterWorker(clusterId, { clusterRoleId });
  return { success: true, worker };
}

export async function assignWorkerRole(workerId, clusterRoleId) {
  await requireAuth();
  dbUpdateClusterWorkerRoleId(workerId, clusterRoleId);
  return { success: true };
}

export async function renameClusterWorker(workerId, name) {
  await requireAuth();
  dbUpdateClusterWorkerName(workerId, name);
  return { success: true };
}

export async function updateWorkerTriggers(workerId, triggerConfig) {
  await requireAuth();
  dbUpdateWorkerTriggerConfig(workerId, triggerConfig);
  // Reload cluster runtime so crons/webhooks reflect the change
  const { reloadClusterRuntime } = await import('./runtime.js');
  reloadClusterRuntime();
  return { success: true };
}

export async function triggerWorkerManually(workerId) {
  await requireAuth();
  const { executeWorker } = await import('./execute.js');
  const result = await executeWorker(workerId, 'manual');
  return result;
}

export async function removeClusterWorker(workerId) {
  await requireAuth();
  dbDeleteClusterWorker(workerId);
  // Reload cluster runtime in case this worker had triggers
  const { reloadClusterRuntime } = await import('./runtime.js');
  reloadClusterRuntime();
  return { success: true };
}

// ── Start / Stop / Status ─────────────────────────────────

export async function startCluster(clusterId) {
  const user = await requireAuth();
  const cluster = getClusterById(clusterId);
  if (!cluster || cluster.userId !== user.id) return { success: false };

  const workers = getClusterWorkersByCluster(clusterId).map((w) => ({
    ...w,
    triggerConfig: w.triggerConfig ? JSON.parse(w.triggerConfig) : null,
    folders: w.folders ? JSON.parse(w.folders) : null,
  }));

  const { ensureClusterFolders, clusterNaming } = await import('./execute.js');
  const { dataDir } = clusterNaming(cluster);

  // Ensure cluster data dir and folders
  const parsedCluster = { ...cluster, folders: cluster.folders ? JSON.parse(cluster.folders) : null };
  fs.mkdirSync(dataDir, { recursive: true });
  ensureClusterFolders(parsedCluster, workers, dataDir);

  // Write cluster-level .initialized marker
  const clusterInitMarker = path.join(dataDir, '.initialized');
  const clusterAlreadyInitialized = fs.existsSync(clusterInitMarker);
  if (!clusterAlreadyInitialized) {
    fs.writeFileSync(clusterInitMarker, new Date().toISOString());
  }

  // Start worker #1 (replicaIndex 1, the first worker) if not already initialized
  const firstWorker = workers.find((w) => w.replicaIndex === 1) || workers[0];
  let workerInitialized = false;
  if (firstWorker) {
    const workerInitMarker = path.join(dataDir, `worker-${firstWorker.replicaIndex}`, '.initialized');
    fs.mkdirSync(path.dirname(workerInitMarker), { recursive: true });
    workerInitialized = fs.existsSync(workerInitMarker);

    if (!workerInitialized) {
      const { executeWorker } = await import('./execute.js');
      // Fire-and-forget — don't block. Write marker after launch.
      executeWorker(firstWorker.id, 'manual').then(() => {
        fs.writeFileSync(workerInitMarker, new Date().toISOString());
      }).catch((err) => {
        console.error('[cluster] Failed to start first worker:', err.message);
      });
    }
  }

  return { success: true, clusterInitialized: clusterAlreadyInitialized, workerInitialized };
}

export async function stopCluster(clusterId) {
  const user = await requireAuth();
  const cluster = getClusterById(clusterId);
  if (!cluster || cluster.userId !== user.id) return { success: false };

  const workers = getClusterWorkersByCluster(clusterId);
  const { stopWorkerContainer } = await import('./execute.js');

  for (const worker of workers) {
    try {
      await stopWorkerContainer(worker.id);
    } catch (err) {
      console.error(`[cluster] Failed to stop worker ${worker.id}:`, err.message);
    }
  }

  return { success: true };
}

export async function stopWorker(workerId) {
  await requireAuth();
  const { stopWorkerContainer } = await import('./execute.js');
  await stopWorkerContainer(workerId);
  return { success: true };
}

export async function getClusterStatus(clusterId) {
  const user = await requireAuth();
  const cluster = getClusterById(clusterId);
  if (!cluster || cluster.userId !== user.id) return {};

  const workers = getClusterWorkersByCluster(clusterId);
  const { isWorkerRunning } = await import('./execute.js');

  const status = {};
  for (const worker of workers) {
    status[worker.id] = await isWorkerRunning(worker.id);
  }
  return status;
}
