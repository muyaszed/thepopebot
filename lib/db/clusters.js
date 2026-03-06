import { randomUUID } from 'crypto';
import { eq, desc, sql, count } from 'drizzle-orm';
import { getDb } from './index.js';
import { clusters, clusterRoles, clusterWorkers } from './schema.js';

export function workerShortId(worker) {
  return worker.id.replace(/-/g, '').slice(0, 8);
}

// ── Clusters ──────────────────────────────────────────────

export function createCluster(userId, { name = 'New Cluster', systemPrompt = '', id = null } = {}) {
  const db = getDb();
  const now = Date.now();
  const cluster = {
    id: id || randomUUID(),
    userId,
    name,
    systemPrompt,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(clusters).values(cluster).run();
  return cluster;
}

export function getClusterById(id) {
  const db = getDb();
  return db.select().from(clusters).where(eq(clusters.id, id)).get();
}

export function getClustersByUser(userId) {
  const db = getDb();
  return db
    .select()
    .from(clusters)
    .where(eq(clusters.userId, userId))
    .orderBy(desc(clusters.updatedAt))
    .all();
}

export function updateClusterName(id, name) {
  const db = getDb();
  db.update(clusters)
    .set({ name, updatedAt: Date.now() })
    .where(eq(clusters.id, id))
    .run();
}

export function updateClusterSystemPrompt(id, systemPrompt) {
  const db = getDb();
  db.update(clusters)
    .set({ systemPrompt, updatedAt: Date.now() })
    .where(eq(clusters.id, id))
    .run();
}

export function toggleClusterStarred(id) {
  const db = getDb();
  const cluster = db.select({ starred: clusters.starred }).from(clusters).where(eq(clusters.id, id)).get();
  const newValue = cluster?.starred ? 0 : 1;
  db.update(clusters)
    .set({ starred: newValue })
    .where(eq(clusters.id, id))
    .run();
  return newValue;
}

export function toggleClusterEnabled(id) {
  const db = getDb();
  const cluster = db.select({ enabled: clusters.enabled }).from(clusters).where(eq(clusters.id, id)).get();
  const newValue = cluster?.enabled ? 0 : 1;
  db.update(clusters)
    .set({ enabled: newValue, updatedAt: Date.now() })
    .where(eq(clusters.id, id))
    .run();
  return newValue;
}

export function updateClusterFolders(id, folders) {
  const db = getDb();
  db.update(clusters)
    .set({ folders: folders ? JSON.stringify(folders) : null, updatedAt: Date.now() })
    .where(eq(clusters.id, id))
    .run();
}

export function deleteCluster(id) {
  const db = getDb();
  db.delete(clusterWorkers).where(eq(clusterWorkers.clusterId, id)).run();
  db.delete(clusters).where(eq(clusters.id, id)).run();
}

// ── Cluster Roles ─────────────────────────────────────────

export function createClusterRole(userId, { roleName, role = '', id = null } = {}) {
  const db = getDb();
  const now = Date.now();
  const record = {
    id: id || randomUUID(),
    userId,
    roleName,
    role,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(clusterRoles).values(record).run();
  return record;
}

export function getClusterRoleById(id) {
  const db = getDb();
  return db.select().from(clusterRoles).where(eq(clusterRoles.id, id)).get();
}

export function getClusterRolesByUser(userId) {
  const db = getDb();
  return db
    .select()
    .from(clusterRoles)
    .where(eq(clusterRoles.userId, userId))
    .orderBy(desc(clusterRoles.updatedAt))
    .all();
}

export function updateClusterRole(id, { roleName, role }) {
  const db = getDb();
  const updates = { updatedAt: Date.now() };
  if (roleName !== undefined) updates.roleName = roleName;
  if (role !== undefined) updates.role = role;
  db.update(clusterRoles)
    .set(updates)
    .where(eq(clusterRoles.id, id))
    .run();
}

export function deleteClusterRole(id) {
  const db = getDb();
  // Unassign workers that reference this role
  db.update(clusterWorkers)
    .set({ clusterRoleId: null, updatedAt: Date.now() })
    .where(eq(clusterWorkers.clusterRoleId, id))
    .run();
  db.delete(clusterRoles).where(eq(clusterRoles.id, id)).run();
}

// ── Cluster Workers ───────────────────────────────────────

export function createClusterWorker(clusterId, { clusterRoleId = null, codeWorkspaceId = null, id = null } = {}) {
  const db = getDb();
  const now = Date.now();
  const result = db
    .select({ count: count() })
    .from(clusterWorkers)
    .where(eq(clusterWorkers.clusterId, clusterId))
    .get();
  const existingCount = result?.count ?? 0;
  const worker = {
    id: id || randomUUID(),
    clusterId,
    clusterRoleId,
    name: `Worker ${existingCount + 1}`,
    codeWorkspaceId,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(clusterWorkers).values(worker).run();
  // Touch parent cluster
  db.update(clusters).set({ updatedAt: now }).where(eq(clusters.id, clusterId)).run();
  return worker;
}

export function getClusterWorkersByCluster(clusterId) {
  const db = getDb();
  return db
    .select()
    .from(clusterWorkers)
    .where(eq(clusterWorkers.clusterId, clusterId))
    .orderBy(clusterWorkers.createdAt)
    .all();
}

export function getClusterWorkerById(id) {
  const db = getDb();
  return db.select().from(clusterWorkers).where(eq(clusterWorkers.id, id)).get();
}

export function updateClusterWorkerRoleId(id, clusterRoleId) {
  const db = getDb();
  db.update(clusterWorkers)
    .set({ clusterRoleId, updatedAt: Date.now() })
    .where(eq(clusterWorkers.id, id))
    .run();
}

export function updateClusterWorkerName(id, name) {
  const db = getDb();
  db.update(clusterWorkers)
    .set({ name, updatedAt: Date.now() })
    .where(eq(clusterWorkers.id, id))
    .run();
}

export function updateWorkerFolders(id, folders) {
  const db = getDb();
  db.update(clusterWorkers)
    .set({ folders: folders ? JSON.stringify(folders) : null, updatedAt: Date.now() })
    .where(eq(clusterWorkers.id, id))
    .run();
}

export function updateWorkerTriggerConfig(id, config) {
  const db = getDb();
  db.update(clusterWorkers)
    .set({ triggerConfig: config ? JSON.stringify(config) : null, updatedAt: Date.now() })
    .where(eq(clusterWorkers.id, id))
    .run();
}

export function getAllWorkersWithTriggers() {
  const db = getDb();
  return db
    .select({ worker: clusterWorkers })
    .from(clusterWorkers)
    .innerJoin(clusters, eq(clusterWorkers.clusterId, clusters.id))
    .where(sql`${clusterWorkers.triggerConfig} IS NOT NULL AND ${clusters.enabled} = 1`)
    .all()
    .map(({ worker }) => ({
      ...worker,
      triggerConfig: JSON.parse(worker.triggerConfig),
    }));
}

export function getWorkerWithClusterAndRole(workerId) {
  const db = getDb();
  const worker = db.select().from(clusterWorkers).where(eq(clusterWorkers.id, workerId)).get();
  if (!worker) return null;
  const cluster = db.select().from(clusters).where(eq(clusters.id, worker.clusterId)).get();
  const role = worker.clusterRoleId
    ? db.select().from(clusterRoles).where(eq(clusterRoles.id, worker.clusterRoleId)).get()
    : null;
  return {
    ...worker,
    triggerConfig: worker.triggerConfig ? JSON.parse(worker.triggerConfig) : null,
    cluster,
    role,
  };
}

export function deleteClusterWorker(id) {
  const db = getDb();
  const worker = db.select().from(clusterWorkers).where(eq(clusterWorkers.id, id)).get();
  if (!worker) return;
  db.delete(clusterWorkers).where(eq(clusterWorkers.id, id)).run();
  // Touch parent cluster
  db.update(clusters).set({ updatedAt: Date.now() }).where(eq(clusters.id, worker.clusterId)).run();
}
