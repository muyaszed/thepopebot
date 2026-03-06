'use client';

import { useState, useEffect, useRef } from 'react';
import { PageLayout } from '../../chat/components/page-layout.js';
import { PlusIcon, TrashIcon, PencilIcon, CopyIcon, CheckIcon } from '../../chat/components/icons.js';
import {
  getCluster, renameCluster, updateClusterSystemPrompt, updateClusterFolders,
  getClusterRoles, addClusterWorker, assignWorkerRole, renameClusterWorker,
  updateWorkerTriggers, updateWorkerFoldersAction, removeClusterWorker,
  triggerWorkerManually, startCluster, stopCluster, stopWorker, getClusterStatus,
} from '../actions.js';
import { ConfirmDialog } from '../../chat/components/ui/confirm-dialog.js';

export function ClusterPage({ session, clusterId }) {
  const [cluster, setCluster] = useState(null);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [systemPromptValue, setSystemPromptValue] = useState('');
  const [workerStatus, setWorkerStatus] = useState({});
  const [clusterBusy, setClusterBusy] = useState(false);
  const [foldersValue, setFoldersValue] = useState('');
  const nameRef = useRef(null);

  const load = async () => {
    try {
      const [result, allRoles] = await Promise.all([
        getCluster(clusterId),
        getClusterRoles(),
      ]);
      setCluster(result);
      setRoles(allRoles);
      setNameValue(result?.name || '');
      setSystemPromptValue(result?.systemPrompt || '');
      setFoldersValue(result?.folders ? result.folders.join(', ') : '');
    } catch (err) {
      console.error('Failed to load cluster:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [clusterId]);

  // Status polling
  useEffect(() => {
    if (!cluster?.workers?.length) return;
    let active = true;
    const poll = async () => {
      try {
        const status = await getClusterStatus(clusterId);
        if (active) setWorkerStatus(status);
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 10000);
    return () => { active = false; clearInterval(interval); };
  }, [cluster?.workers?.length, clusterId]);

  useEffect(() => {
    if (editingName && nameRef.current) {
      nameRef.current.focus();
      nameRef.current.select();
    }
  }, [editingName]);

  const saveName = async () => {
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== cluster.name) {
      await renameCluster(clusterId, trimmed);
      setCluster((prev) => ({ ...prev, name: trimmed }));
    }
    setEditingName(false);
  };

  const saveSystemPrompt = async () => {
    if (systemPromptValue !== (cluster.systemPrompt || '')) {
      await updateClusterSystemPrompt(clusterId, systemPromptValue);
      setCluster((prev) => ({ ...prev, systemPrompt: systemPromptValue }));
    }
  };

  const saveFolders = async () => {
    const folders = foldersValue.split(',').map((s) => s.trim()).filter(Boolean);
    const current = cluster.folders || [];
    if (JSON.stringify(folders) !== JSON.stringify(current)) {
      await updateClusterFolders(clusterId, folders.length ? folders : null);
      setCluster((prev) => ({ ...prev, folders: folders.length ? folders : null }));
    }
  };

  const handleAddWorker = async () => {
    const { success, worker } = await addClusterWorker(clusterId);
    if (success) {
      setCluster((prev) => ({
        ...prev,
        workers: [...(prev.workers || []), worker],
      }));
    }
  };

  const handleAssignRole = async (workerId, clusterRoleId) => {
    const roleId = clusterRoleId || null;
    await assignWorkerRole(workerId, roleId);
    setCluster((prev) => ({
      ...prev,
      workers: prev.workers.map((w) =>
        w.id === workerId ? { ...w, clusterRoleId: roleId } : w
      ),
    }));
  };

  const handleRenameWorker = async (workerId, name) => {
    setCluster((prev) => ({
      ...prev,
      workers: prev.workers.map((w) =>
        w.id === workerId ? { ...w, name } : w
      ),
    }));
    await renameClusterWorker(workerId, name);
  };

  const handleUpdateTriggers = async (workerId, triggerConfig) => {
    setCluster((prev) => ({
      ...prev,
      workers: prev.workers.map((w) =>
        w.id === workerId ? { ...w, triggerConfig } : w
      ),
    }));
    await updateWorkerTriggers(workerId, triggerConfig);
  };

  const handleRemoveWorker = async (workerId) => {
    await removeClusterWorker(workerId);
    setCluster((prev) => ({
      ...prev,
      workers: prev.workers.filter((w) => w.id !== workerId),
    }));
  };

  const handleStartCluster = async () => {
    setClusterBusy(true);
    try {
      await startCluster(clusterId);
    } catch (err) {
      console.error('Failed to start cluster:', err);
    } finally {
      setClusterBusy(false);
      // Refresh status
      try {
        const status = await getClusterStatus(clusterId);
        setWorkerStatus(status);
      } catch {}
    }
  };

  const handleStopCluster = async () => {
    setClusterBusy(true);
    try {
      await stopCluster(clusterId);
    } catch (err) {
      console.error('Failed to stop cluster:', err);
    } finally {
      setClusterBusy(false);
      try {
        const status = await getClusterStatus(clusterId);
        setWorkerStatus(status);
      } catch {}
    }
  };

  const runningCount = Object.values(workerStatus).filter(Boolean).length;
  const totalCount = cluster?.workers?.length || 0;

  if (loading) {
    return (
      <PageLayout session={session}>
        <div className="flex flex-col gap-4">
          <div className="h-8 w-48 animate-pulse rounded-md bg-border/50" />
          <div className="h-40 animate-pulse rounded-md bg-border/50" />
        </div>
      </PageLayout>
    );
  }

  if (!cluster) {
    return (
      <PageLayout session={session}>
        <p className="text-sm text-muted-foreground py-8 text-center">Cluster not found.</p>
      </PageLayout>
    );
  }

  return (
    <PageLayout session={session}>
      {/* Breadcrumb + Name */}
      <div className="flex items-center gap-3 mb-6">
        <a
          href="/clusters/list"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Clusters
        </a>
        <span className="text-muted-foreground">/</span>
        {editingName ? (
          <input
            ref={nameRef}
            type="text"
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveName();
              if (e.key === 'Escape') { setEditingName(false); setNameValue(cluster.name); }
            }}
            onBlur={saveName}
            className="text-2xl font-semibold bg-background border border-input rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-ring"
          />
        ) : (
          <h1
            className="text-2xl font-semibold cursor-pointer hover:text-muted-foreground"
            onClick={() => setEditingName(true)}
            title="Click to rename"
          >
            {cluster.name}
          </h1>
        )}
        {!editingName && (
          <button
            onClick={() => setEditingName(true)}
            className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted"
          >
            <PencilIcon size={16} />
          </button>
        )}
      </div>

      {/* Cluster Controls */}
      {totalCount > 0 && (
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={handleStartCluster}
            disabled={clusterBusy}
            className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50"
          >
            {clusterBusy ? 'Starting...' : 'Start Cluster'}
          </button>
          <button
            onClick={handleStopCluster}
            disabled={clusterBusy}
            className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium border border-input hover:bg-muted disabled:opacity-50"
          >
            {clusterBusy ? 'Stopping...' : 'Stop Cluster'}
          </button>
          <span className="text-sm text-muted-foreground">
            {runningCount}/{totalCount} running
          </span>
        </div>
      )}

      {/* System Prompt */}
      <div className="mb-6">
        <label className="text-sm font-medium block mb-1">System Prompt</label>
        <p className="text-xs text-muted-foreground mb-2">Shared instructions applied to all workers in this cluster.</p>
        <textarea
          value={systemPromptValue}
          onChange={(e) => setSystemPromptValue(e.target.value)}
          onBlur={saveSystemPrompt}
          placeholder="Enter shared instructions for all workers..."
          rows={4}
          className="w-full text-sm bg-background border border-input rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring resize-y font-mono"
        />
      </div>

      {/* Cluster Folders */}
      <div className="mb-6">
        <label className="text-sm font-medium block mb-1">Folders</label>
        <p className="text-xs text-muted-foreground mb-2">Comma-separated folder names created under shared/ for all workers.</p>
        <input
          type="text"
          value={foldersValue}
          onChange={(e) => setFoldersValue(e.target.value)}
          onBlur={saveFolders}
          onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
          placeholder="inbox, output, reports"
          className="w-full text-sm bg-background border border-input rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring font-mono"
        />
      </div>

      {/* Workers */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">
            Workers
            <span className="text-sm font-normal text-muted-foreground ml-2">
              {cluster.workers?.length || 0} {(cluster.workers?.length || 0) === 1 ? 'replica' : 'replicas'}
            </span>
          </h2>
          <button
            onClick={handleAddWorker}
            className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium bg-foreground text-background hover:bg-foreground/90"
          >
            <PlusIcon size={16} />
            Add worker
          </button>
        </div>

        {(!cluster.workers || cluster.workers.length === 0) ? (
          <div className="rounded-md border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted-foreground mb-3">No workers yet. Add a worker to define a replica in this cluster.</p>
            <button
              onClick={handleAddWorker}
              className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium border border-input hover:bg-muted"
            >
              <PlusIcon size={16} />
              Add first worker
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {cluster.workers.map((worker) => (
              <WorkerRow
                key={worker.id}
                worker={worker}
                roles={roles}
                running={!!workerStatus[worker.id]}
                onAssignRole={handleAssignRole}
                onRename={handleRenameWorker}
                onUpdateTriggers={handleUpdateTriggers}
                onRemove={handleRemoveWorker}
              />
            ))}
          </div>
        )}

        {roles.length === 0 && cluster.workers?.length > 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            No roles defined yet.{' '}
            <a href="/clusters/roles" className="underline hover:text-foreground">Create roles</a>
            {' '}to assign them to workers.
          </p>
        )}
      </div>
    </PageLayout>
  );
}

function WorkerRow({ worker, roles, running, onAssignRole, onRename, onUpdateTriggers, onRemove }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(worker.name || `Worker ${worker.replicaIndex}`);
  const [runningWorker, setRunningWorker] = useState(false);
  const [stoppingWorker, setStoppingWorker] = useState(false);
  const [foldersValue, setFoldersValue] = useState(worker.folders ? worker.folders.join(', ') : '');
  const nameRef = useRef(null);
  const assignedRole = roles.find((r) => r.id === worker.clusterRoleId);

  const tc = worker.triggerConfig || {};
  const hasCron = !!(tc.cron && tc.cron.enabled);
  const hasFileWatch = !!(tc.file_watch && tc.file_watch.enabled);
  const hasWebhook = !!(tc.webhook && tc.webhook.enabled);

  const [cronValue, setCronValue] = useState(tc.cron?.schedule || '');
  const [fileWatchValue, setFileWatchValue] = useState(tc.file_watch?.paths || '');

  useEffect(() => {
    if (editingName && nameRef.current) {
      nameRef.current.focus();
      nameRef.current.select();
    }
  }, [editingName]);

  const saveName = () => {
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== worker.name) {
      onRename(worker.id, trimmed);
    }
    setEditingName(false);
  };

  const buildConfig = (overrides) => {
    const next = { ...tc, ...overrides };
    // Remove disabled trigger keys entirely
    if (next.cron && !next.cron.enabled) delete next.cron;
    if (next.file_watch && !next.file_watch.enabled) delete next.file_watch;
    if (next.webhook && !next.webhook.enabled) delete next.webhook;
    return Object.keys(next).length ? next : null;
  };

  const toggleTrigger = (type) => {
    if (type === 'cron') {
      if (hasCron) {
        onUpdateTriggers(worker.id, buildConfig({ cron: { enabled: false } }));
      } else {
        const schedule = cronValue || '*/5 * * * *';
        if (!cronValue) setCronValue(schedule);
        onUpdateTriggers(worker.id, buildConfig({ cron: { enabled: true, schedule } }));
      }
    } else if (type === 'file_watch') {
      if (hasFileWatch) {
        onUpdateTriggers(worker.id, buildConfig({ file_watch: { enabled: false } }));
      } else {
        const paths = fileWatchValue || '';
        onUpdateTriggers(worker.id, buildConfig({ file_watch: { enabled: true, paths } }));
      }
    } else if (type === 'webhook') {
      onUpdateTriggers(worker.id, buildConfig({ webhook: { enabled: !hasWebhook } }));
    }
  };

  const saveCron = () => {
    const trimmed = cronValue.trim();
    if (hasCron && trimmed !== (tc.cron?.schedule || '')) {
      onUpdateTriggers(worker.id, buildConfig({ cron: { enabled: true, schedule: trimmed } }));
    }
  };

  const saveFileWatch = () => {
    const trimmed = fileWatchValue.trim();
    if (hasFileWatch && trimmed !== (tc.file_watch?.paths || '')) {
      onUpdateTriggers(worker.id, buildConfig({ file_watch: { enabled: true, paths: trimmed } }));
    }
  };

  const saveFolders = async () => {
    const folders = foldersValue.split(',').map((s) => s.trim()).filter(Boolean);
    const current = worker.folders || [];
    if (JSON.stringify(folders) !== JSON.stringify(current)) {
      await updateWorkerFoldersAction(worker.id, folders.length ? folders : null);
    }
  };

  const handleRun = async () => {
    setRunningWorker(true);
    try {
      await triggerWorkerManually(worker.id);
    } catch (err) {
      console.error('Failed to trigger worker:', err);
    } finally {
      setRunningWorker(false);
    }
  };

  const handleStop = async () => {
    setStoppingWorker(true);
    try {
      await stopWorker(worker.id);
    } catch (err) {
      console.error('Failed to stop worker:', err);
    } finally {
      setStoppingWorker(false);
    }
  };

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-xs font-mono font-medium shrink-0">
          {worker.replicaIndex}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {editingName ? (
              <input
                ref={nameRef}
                type="text"
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveName();
                  if (e.key === 'Escape') { setEditingName(false); setNameValue(worker.name || `Worker ${worker.replicaIndex}`); }
                }}
                onBlur={saveName}
                className="text-sm font-medium bg-background border border-input rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-ring w-full max-w-xs"
              />
            ) : (
              <span className="text-sm font-medium truncate">
                {worker.name || `Worker ${worker.replicaIndex}`}
              </span>
            )}
            {!editingName && (
              <button
                onClick={() => setEditingName(true)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted"
              >
                <PencilIcon size={12} />
              </button>
            )}
            {/* Status badge */}
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
              running
                ? 'bg-green-500/15 text-green-600 dark:text-green-400'
                : 'bg-muted text-muted-foreground'
            }`}>
              {running ? 'Running' : 'Stopped'}
            </span>
          </div>
          {assignedRole?.role && (
            <span className="text-xs text-muted-foreground mt-0.5 block truncate">
              {assignedRole.role}
            </span>
          )}
        </div>

        {/* Worker action buttons */}
        <button
          onClick={handleRun}
          disabled={runningWorker || running}
          className="rounded-md px-2.5 py-1.5 text-xs font-medium border border-input hover:bg-muted disabled:opacity-50 shrink-0"
        >
          {runningWorker ? 'Starting...' : 'Run'}
        </button>
        {running && (
          <button
            onClick={handleStop}
            disabled={stoppingWorker}
            className="rounded-md px-2.5 py-1.5 text-xs font-medium border border-input hover:bg-muted disabled:opacity-50 shrink-0"
          >
            {stoppingWorker ? 'Stopping...' : 'Stop'}
          </button>
        )}

        <select
          value={worker.clusterRoleId || ''}
          onChange={(e) => onAssignRole(worker.id, e.target.value)}
          className="text-sm bg-background border border-input rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring shrink-0"
        >
          <option value="">Unassigned</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>{r.roleName}</option>
          ))}
        </select>

        <button
          onClick={() => setConfirmDelete(true)}
          className="rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-muted shrink-0"
          aria-label="Remove worker"
        >
          <TrashIcon size={16} />
        </button>
      </div>

      {/* Trigger badges */}
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">Triggers:</span>
        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-foreground/10 text-foreground">
          Manual
        </span>
        <button
          onClick={() => toggleTrigger('cron')}
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border transition-colors ${
            hasCron
              ? 'bg-foreground text-background border-foreground'
              : 'bg-background text-muted-foreground border-input hover:border-foreground/50'
          }`}
        >
          Cron
        </button>
        <button
          onClick={() => toggleTrigger('file_watch')}
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border transition-colors ${
            hasFileWatch
              ? 'bg-foreground text-background border-foreground'
              : 'bg-background text-muted-foreground border-input hover:border-foreground/50'
          }`}
        >
          File Watch
        </button>
        <button
          onClick={() => toggleTrigger('webhook')}
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border transition-colors ${
            hasWebhook
              ? 'bg-foreground text-background border-foreground'
              : 'bg-background text-muted-foreground border-input hover:border-foreground/50'
          }`}
        >
          Webhook
        </button>
      </div>

      {/* Trigger config fields */}
      {(hasCron || hasFileWatch || hasWebhook) && (
        <div className="mt-3 flex flex-col gap-2">
          {hasCron && (
            <div className="rounded-md border border-input p-2.5">
              <label className="text-xs font-medium text-muted-foreground block mb-1">Cron Schedule</label>
              <input
                type="text"
                value={cronValue}
                onChange={(e) => setCronValue(e.target.value)}
                onBlur={saveCron}
                onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                placeholder="*/5 * * * *"
                className="text-sm bg-background border border-input rounded px-2 py-1 w-full focus:outline-none focus:ring-2 focus:ring-ring font-mono"
              />
            </div>
          )}
          {hasFileWatch && (
            <div className="rounded-md border border-input p-2.5">
              <label className="text-xs font-medium text-muted-foreground block mb-1">Watch Paths</label>
              <input
                type="text"
                value={fileWatchValue}
                onChange={(e) => setFileWatchValue(e.target.value)}
                onBlur={saveFileWatch}
                onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                placeholder="shared/inbox, shared/reports"
                className="text-sm bg-background border border-input rounded px-2 py-1 w-full focus:outline-none focus:ring-2 focus:ring-ring font-mono"
              />
              <p className="text-xs text-muted-foreground mt-1">Comma-separated paths relative to cluster data dir.</p>
            </div>
          )}
          {hasWebhook && (
            <WebhookInfo workerId={worker.id} />
          )}
        </div>
      )}

      {/* Worker Folders */}
      <div className="mt-3">
        <div className="rounded-md border border-input p-2.5">
          <label className="text-xs font-medium text-muted-foreground block mb-1">Folders</label>
          <input
            type="text"
            value={foldersValue}
            onChange={(e) => setFoldersValue(e.target.value)}
            onBlur={saveFolders}
            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
            placeholder="inbox, output"
            className="text-sm bg-background border border-input rounded px-2 py-1 w-full focus:outline-none focus:ring-2 focus:ring-ring font-mono"
          />
          <p className="text-xs text-muted-foreground mt-1">Comma-separated folder names created under worker-{worker.replicaIndex}/.</p>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Remove worker?"
        description={`This will remove "${worker.name || `Worker ${worker.replicaIndex}`}" from the cluster.`}
        confirmLabel="Remove"
        onConfirm={() => {
          setConfirmDelete(false);
          onRemove(worker.id);
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

function CopyButton({ text, label }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={copy}
      className="inline-flex items-center justify-center rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
      title={copied ? 'Copied!' : `Copy ${label}`}
    >
      {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
    </button>
  );
}

function WebhookInfo({ workerId }) {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.com';
  const endpoint = `${origin}/api/cluster/${workerId}/webhook`;
  const curlCmd = `curl -X POST ${endpoint} \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "Hello from webhook"}'`;

  return (
    <div className="rounded-md border border-input p-2.5">
      <label className="text-xs font-medium text-muted-foreground block mb-2">Webhook</label>

      {/* Endpoint URL */}
      <div className="flex items-center gap-2 mb-2">
        <code className="flex-1 min-w-0 text-xs bg-muted px-2 py-1.5 rounded font-mono text-foreground truncate select-all">
          {endpoint}
        </code>
        <CopyButton text={endpoint} label="endpoint" />
      </div>

      {/* Curl command */}
      <label className="text-xs font-medium text-muted-foreground block mb-1 mt-2">Example cURL</label>
      <div className="flex items-start gap-2">
        <pre className="flex-1 min-w-0 text-xs bg-muted/70 border border-input rounded-md px-2.5 py-2 font-mono text-foreground overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">{curlCmd}</pre>
        <CopyButton text={curlCmd} label="curl command" />
      </div>
    </div>
  );
}
