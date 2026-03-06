# lib/cluster/ — Cluster System

Clusters are groups of Docker worker containers that share a data directory and system prompt. Each cluster has workers that can be triggered manually, on a cron schedule, via webhook, or by file watch.

## Architecture

- **`actions.js`** — Server Actions (`'use server'`) for all cluster UI operations. Handles auth via `requireAuth()`, delegates to DB functions in `lib/db/clusters.js`, and creates directories on disk at lifecycle events.
- **`execute.js`** — Docker container lifecycle: launch, stop, inspect workers. Exports path helpers for cluster/worker directories.
- **`runtime.js`** — In-memory trigger runtime. Manages cron schedules (node-cron), webhook registrations, and file watchers (chokidar). Started at boot, reloaded when triggers change.
- **`components/`** — React UI (cluster-page, clusters-page, cluster-roles-page, clusters-layout).

## Naming & IDs

- **Cluster short ID**: `cluster.id` dashes stripped, first 8 chars → used in `cluster-{shortId}` project name
- **Worker short ID**: `worker.id` dashes stripped, first 8 chars → `workerShortId(worker)` from `lib/db/clusters.js`
- **Container name**: `cluster-{clusterShortId}-worker-{workerShortId}`

## Directory Structure on Disk

```
data/clusters/
  cluster-{shortId}/              ← created by createCluster()
    shared/                       ← created by createCluster()
      {folder}/                   ← created by updateClusterFolders()
    {workerShortId}/              ← created by addClusterWorker()
      {folder}/                   ← created by updateWorkerFoldersAction()
```

Directories are created at lifecycle events in `actions.js`, not at container launch time. The entire cluster data dir is bind-mounted into worker containers at `/home/claude-code/workspace`.

## Directory Creation Rules

| Event | Directory Created |
|-------|-------------------|
| Create cluster | `cluster-{id}/shared/` |
| Add worker | `cluster-{id}/{workerShortId}/` |
| Set cluster folders | `cluster-{id}/shared/{folder}` for each folder |
| Set worker folders | `cluster-{id}/{workerShortId}/{folder}` for each folder |

## Trigger Types

Workers support multiple concurrent triggers configured via `triggerConfig` JSON:

| Trigger | Config Key | How It Works |
|---------|-----------|--------------|
| Manual | (always available) | `triggerWorkerManually()` → `runClusterWorker()` |
| Cron | `cron.schedule` | node-cron schedules in `runtime.js` |
| Webhook | `webhook.enabled` | POST to `/api/cluster/{workerId}/webhook` |
| File Watch | `file_watch.paths` | chokidar watches paths relative to cluster data dir |

## Key Functions

**`execute.js`**:
- `clusterNaming(cluster)` → `{ project, dataDir }` for Docker resource naming
- `clusterDir(cluster)` → absolute path to cluster data directory
- `workerDir(cluster, worker)` → absolute path to worker subdirectory
- `runClusterWorker(workerId, context?)` → launches container, returns `{ busy, containerName, error }`
- `stopWorkerContainer(workerId)` → stops and removes container
- `isWorkerRunning(workerId)` → checks container state

**`runtime.js`**:
- `startClusterRuntime()` → called once at boot
- `reloadClusterRuntime()` → called after trigger/worker changes
- `handleClusterWebhook(workerId, request)` → webhook endpoint handler

## DB Tables

- `clusters` — cluster metadata (name, system_prompt, folders, enabled)
- `cluster_roles` — reusable role definitions assigned to workers
- `cluster_workers` — individual workers (cluster_id, cluster_role_id, name, trigger_config, folders)

Workers are ordered by `createdAt`. No replica index — workers are identified by UUID short ID.
