"use client";
import { jsx, jsxs } from "react/jsx-runtime";
import { useState, useEffect, useRef } from "react";
import { PageLayout } from "../../chat/components/page-layout.js";
import { PlusIcon, TrashIcon, PencilIcon, CopyIcon, CheckIcon } from "../../chat/components/icons.js";
import {
  getCluster,
  renameCluster,
  updateClusterSystemPrompt,
  updateClusterFolders,
  getClusterRoles,
  addClusterWorker,
  assignWorkerRole,
  renameClusterWorker,
  updateWorkerTriggers,
  updateWorkerFoldersAction,
  removeClusterWorker,
  triggerWorkerManually,
  startCluster,
  stopCluster,
  stopWorker,
  getClusterStatus
} from "../actions.js";
import { ConfirmDialog } from "../../chat/components/ui/confirm-dialog.js";
function ClusterPage({ session, clusterId }) {
  const [cluster, setCluster] = useState(null);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [systemPromptValue, setSystemPromptValue] = useState("");
  const [workerStatus, setWorkerStatus] = useState({});
  const [clusterBusy, setClusterBusy] = useState(false);
  const [foldersValue, setFoldersValue] = useState("");
  const nameRef = useRef(null);
  const load = async () => {
    try {
      const [result, allRoles] = await Promise.all([
        getCluster(clusterId),
        getClusterRoles()
      ]);
      setCluster(result);
      setRoles(allRoles);
      setNameValue(result?.name || "");
      setSystemPromptValue(result?.systemPrompt || "");
      setFoldersValue(result?.folders ? result.folders.join(", ") : "");
    } catch (err) {
      console.error("Failed to load cluster:", err);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, [clusterId]);
  useEffect(() => {
    if (!cluster?.workers?.length) return;
    let active = true;
    const poll = async () => {
      try {
        const status = await getClusterStatus(clusterId);
        if (active) setWorkerStatus(status);
      } catch {
      }
    };
    poll();
    const interval = setInterval(poll, 1e4);
    return () => {
      active = false;
      clearInterval(interval);
    };
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
    if (systemPromptValue !== (cluster.systemPrompt || "")) {
      await updateClusterSystemPrompt(clusterId, systemPromptValue);
      setCluster((prev) => ({ ...prev, systemPrompt: systemPromptValue }));
    }
  };
  const saveFolders = async () => {
    const folders = foldersValue.split(",").map((s) => s.trim()).filter(Boolean);
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
        workers: [...prev.workers || [], worker]
      }));
    }
  };
  const handleAssignRole = async (workerId, clusterRoleId) => {
    const roleId = clusterRoleId || null;
    await assignWorkerRole(workerId, roleId);
    setCluster((prev) => ({
      ...prev,
      workers: prev.workers.map(
        (w) => w.id === workerId ? { ...w, clusterRoleId: roleId } : w
      )
    }));
  };
  const handleRenameWorker = async (workerId, name) => {
    setCluster((prev) => ({
      ...prev,
      workers: prev.workers.map(
        (w) => w.id === workerId ? { ...w, name } : w
      )
    }));
    await renameClusterWorker(workerId, name);
  };
  const handleUpdateTriggers = async (workerId, triggerConfig) => {
    setCluster((prev) => ({
      ...prev,
      workers: prev.workers.map(
        (w) => w.id === workerId ? { ...w, triggerConfig } : w
      )
    }));
    await updateWorkerTriggers(workerId, triggerConfig);
  };
  const handleRemoveWorker = async (workerId) => {
    await removeClusterWorker(workerId);
    setCluster((prev) => ({
      ...prev,
      workers: prev.workers.filter((w) => w.id !== workerId)
    }));
  };
  const handleStartCluster = async () => {
    setClusterBusy(true);
    try {
      await startCluster(clusterId);
    } catch (err) {
      console.error("Failed to start cluster:", err);
    } finally {
      setClusterBusy(false);
      try {
        const status = await getClusterStatus(clusterId);
        setWorkerStatus(status);
      } catch {
      }
    }
  };
  const handleStopCluster = async () => {
    setClusterBusy(true);
    try {
      await stopCluster(clusterId);
    } catch (err) {
      console.error("Failed to stop cluster:", err);
    } finally {
      setClusterBusy(false);
      try {
        const status = await getClusterStatus(clusterId);
        setWorkerStatus(status);
      } catch {
      }
    }
  };
  const runningCount = Object.values(workerStatus).filter(Boolean).length;
  const totalCount = cluster?.workers?.length || 0;
  if (loading) {
    return /* @__PURE__ */ jsx(PageLayout, { session, children: /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-4", children: [
      /* @__PURE__ */ jsx("div", { className: "h-8 w-48 animate-pulse rounded-md bg-border/50" }),
      /* @__PURE__ */ jsx("div", { className: "h-40 animate-pulse rounded-md bg-border/50" })
    ] }) });
  }
  if (!cluster) {
    return /* @__PURE__ */ jsx(PageLayout, { session, children: /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground py-8 text-center", children: "Cluster not found." }) });
  }
  return /* @__PURE__ */ jsxs(PageLayout, { session, children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 mb-6", children: [
      /* @__PURE__ */ jsx(
        "a",
        {
          href: "/clusters/list",
          className: "text-sm text-muted-foreground hover:text-foreground",
          children: "Clusters"
        }
      ),
      /* @__PURE__ */ jsx("span", { className: "text-muted-foreground", children: "/" }),
      editingName ? /* @__PURE__ */ jsx(
        "input",
        {
          ref: nameRef,
          type: "text",
          value: nameValue,
          onChange: (e) => setNameValue(e.target.value),
          onKeyDown: (e) => {
            if (e.key === "Enter") saveName();
            if (e.key === "Escape") {
              setEditingName(false);
              setNameValue(cluster.name);
            }
          },
          onBlur: saveName,
          className: "text-2xl font-semibold bg-background border border-input rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-ring"
        }
      ) : /* @__PURE__ */ jsx(
        "h1",
        {
          className: "text-2xl font-semibold cursor-pointer hover:text-muted-foreground",
          onClick: () => setEditingName(true),
          title: "Click to rename",
          children: cluster.name
        }
      ),
      !editingName && /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => setEditingName(true),
          className: "text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted",
          children: /* @__PURE__ */ jsx(PencilIcon, { size: 16 })
        }
      )
    ] }),
    totalCount > 0 && /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 mb-6", children: [
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: handleStartCluster,
          disabled: clusterBusy,
          className: "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50",
          children: clusterBusy ? "Starting..." : "Start Cluster"
        }
      ),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: handleStopCluster,
          disabled: clusterBusy,
          className: "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium border border-input hover:bg-muted disabled:opacity-50",
          children: clusterBusy ? "Stopping..." : "Stop Cluster"
        }
      ),
      /* @__PURE__ */ jsxs("span", { className: "text-sm text-muted-foreground", children: [
        runningCount,
        "/",
        totalCount,
        " running"
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "mb-6", children: [
      /* @__PURE__ */ jsx("label", { className: "text-sm font-medium block mb-1", children: "System Prompt" }),
      /* @__PURE__ */ jsx("p", { className: "text-xs text-muted-foreground mb-2", children: "Shared instructions applied to all workers in this cluster." }),
      /* @__PURE__ */ jsx(
        "textarea",
        {
          value: systemPromptValue,
          onChange: (e) => setSystemPromptValue(e.target.value),
          onBlur: saveSystemPrompt,
          placeholder: "Enter shared instructions for all workers...",
          rows: 4,
          className: "w-full text-sm bg-background border border-input rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring resize-y font-mono"
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "mb-6", children: [
      /* @__PURE__ */ jsx("label", { className: "text-sm font-medium block mb-1", children: "Folders" }),
      /* @__PURE__ */ jsx("p", { className: "text-xs text-muted-foreground mb-2", children: "Comma-separated folder names created under shared/ for all workers." }),
      /* @__PURE__ */ jsx(
        "input",
        {
          type: "text",
          value: foldersValue,
          onChange: (e) => setFoldersValue(e.target.value),
          onBlur: saveFolders,
          onKeyDown: (e) => {
            if (e.key === "Enter") e.target.blur();
          },
          placeholder: "inbox, output, reports",
          className: "w-full text-sm bg-background border border-input rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring font-mono"
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "mb-6", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-4", children: [
        /* @__PURE__ */ jsxs("h2", { className: "text-lg font-medium", children: [
          "Workers",
          /* @__PURE__ */ jsxs("span", { className: "text-sm font-normal text-muted-foreground ml-2", children: [
            cluster.workers?.length || 0,
            " ",
            (cluster.workers?.length || 0) === 1 ? "replica" : "replicas"
          ] })
        ] }),
        /* @__PURE__ */ jsxs(
          "button",
          {
            onClick: handleAddWorker,
            className: "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium bg-foreground text-background hover:bg-foreground/90",
            children: [
              /* @__PURE__ */ jsx(PlusIcon, { size: 16 }),
              "Add worker"
            ]
          }
        )
      ] }),
      !cluster.workers || cluster.workers.length === 0 ? /* @__PURE__ */ jsxs("div", { className: "rounded-md border border-dashed border-border p-8 text-center", children: [
        /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground mb-3", children: "No workers yet. Add a worker to define a replica in this cluster." }),
        /* @__PURE__ */ jsxs(
          "button",
          {
            onClick: handleAddWorker,
            className: "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium border border-input hover:bg-muted",
            children: [
              /* @__PURE__ */ jsx(PlusIcon, { size: 16 }),
              "Add first worker"
            ]
          }
        )
      ] }) : /* @__PURE__ */ jsx("div", { className: "flex flex-col gap-3", children: cluster.workers.map((worker) => /* @__PURE__ */ jsx(
        WorkerRow,
        {
          worker,
          roles,
          running: !!workerStatus[worker.id],
          onAssignRole: handleAssignRole,
          onRename: handleRenameWorker,
          onUpdateTriggers: handleUpdateTriggers,
          onRemove: handleRemoveWorker
        },
        worker.id
      )) }),
      roles.length === 0 && cluster.workers?.length > 0 && /* @__PURE__ */ jsxs("p", { className: "text-xs text-muted-foreground mt-2", children: [
        "No roles defined yet.",
        " ",
        /* @__PURE__ */ jsx("a", { href: "/clusters/roles", className: "underline hover:text-foreground", children: "Create roles" }),
        " ",
        "to assign them to workers."
      ] })
    ] })
  ] });
}
function WorkerRow({ worker, roles, running, onAssignRole, onRename, onUpdateTriggers, onRemove }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(worker.name || `Worker ${worker.replicaIndex}`);
  const [runningWorker, setRunningWorker] = useState(false);
  const [stoppingWorker, setStoppingWorker] = useState(false);
  const [foldersValue, setFoldersValue] = useState(worker.folders ? worker.folders.join(", ") : "");
  const nameRef = useRef(null);
  const assignedRole = roles.find((r) => r.id === worker.clusterRoleId);
  const tc = worker.triggerConfig || {};
  const hasCron = !!(tc.cron && tc.cron.enabled);
  const hasFileWatch = !!(tc.file_watch && tc.file_watch.enabled);
  const hasWebhook = !!(tc.webhook && tc.webhook.enabled);
  const [cronValue, setCronValue] = useState(tc.cron?.schedule || "");
  const [fileWatchValue, setFileWatchValue] = useState(tc.file_watch?.paths || "");
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
    if (next.cron && !next.cron.enabled) delete next.cron;
    if (next.file_watch && !next.file_watch.enabled) delete next.file_watch;
    if (next.webhook && !next.webhook.enabled) delete next.webhook;
    return Object.keys(next).length ? next : null;
  };
  const toggleTrigger = (type) => {
    if (type === "cron") {
      if (hasCron) {
        onUpdateTriggers(worker.id, buildConfig({ cron: { enabled: false } }));
      } else {
        const schedule = cronValue || "*/5 * * * *";
        if (!cronValue) setCronValue(schedule);
        onUpdateTriggers(worker.id, buildConfig({ cron: { enabled: true, schedule } }));
      }
    } else if (type === "file_watch") {
      if (hasFileWatch) {
        onUpdateTriggers(worker.id, buildConfig({ file_watch: { enabled: false } }));
      } else {
        const paths = fileWatchValue || "";
        onUpdateTriggers(worker.id, buildConfig({ file_watch: { enabled: true, paths } }));
      }
    } else if (type === "webhook") {
      onUpdateTriggers(worker.id, buildConfig({ webhook: { enabled: !hasWebhook } }));
    }
  };
  const saveCron = () => {
    const trimmed = cronValue.trim();
    if (hasCron && trimmed !== (tc.cron?.schedule || "")) {
      onUpdateTriggers(worker.id, buildConfig({ cron: { enabled: true, schedule: trimmed } }));
    }
  };
  const saveFileWatch = () => {
    const trimmed = fileWatchValue.trim();
    if (hasFileWatch && trimmed !== (tc.file_watch?.paths || "")) {
      onUpdateTriggers(worker.id, buildConfig({ file_watch: { enabled: true, paths: trimmed } }));
    }
  };
  const saveFolders = async () => {
    const folders = foldersValue.split(",").map((s) => s.trim()).filter(Boolean);
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
      console.error("Failed to trigger worker:", err);
    } finally {
      setRunningWorker(false);
    }
  };
  const handleStop = async () => {
    setStoppingWorker(true);
    try {
      await stopWorker(worker.id);
    } catch (err) {
      console.error("Failed to stop worker:", err);
    } finally {
      setStoppingWorker(false);
    }
  };
  return /* @__PURE__ */ jsxs("div", { className: "rounded-lg border bg-card p-4", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
      /* @__PURE__ */ jsx("div", { className: "flex items-center justify-center w-8 h-8 rounded-full bg-muted text-xs font-mono font-medium shrink-0", children: worker.replicaIndex }),
      /* @__PURE__ */ jsxs("div", { className: "flex-1 min-w-0", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
          editingName ? /* @__PURE__ */ jsx(
            "input",
            {
              ref: nameRef,
              type: "text",
              value: nameValue,
              onChange: (e) => setNameValue(e.target.value),
              onKeyDown: (e) => {
                if (e.key === "Enter") saveName();
                if (e.key === "Escape") {
                  setEditingName(false);
                  setNameValue(worker.name || `Worker ${worker.replicaIndex}`);
                }
              },
              onBlur: saveName,
              className: "text-sm font-medium bg-background border border-input rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-ring w-full max-w-xs"
            }
          ) : /* @__PURE__ */ jsx("span", { className: "text-sm font-medium truncate", children: worker.name || `Worker ${worker.replicaIndex}` }),
          !editingName && /* @__PURE__ */ jsx(
            "button",
            {
              onClick: () => setEditingName(true),
              className: "text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted",
              children: /* @__PURE__ */ jsx(PencilIcon, { size: 12 })
            }
          ),
          /* @__PURE__ */ jsx("span", { className: `inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${running ? "bg-green-500/15 text-green-600 dark:text-green-400" : "bg-muted text-muted-foreground"}`, children: running ? "Running" : "Stopped" })
        ] }),
        assignedRole?.role && /* @__PURE__ */ jsx("span", { className: "text-xs text-muted-foreground mt-0.5 block truncate", children: assignedRole.role })
      ] }),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: handleRun,
          disabled: runningWorker || running,
          className: "rounded-md px-2.5 py-1.5 text-xs font-medium border border-input hover:bg-muted disabled:opacity-50 shrink-0",
          children: runningWorker ? "Starting..." : "Run"
        }
      ),
      running && /* @__PURE__ */ jsx(
        "button",
        {
          onClick: handleStop,
          disabled: stoppingWorker,
          className: "rounded-md px-2.5 py-1.5 text-xs font-medium border border-input hover:bg-muted disabled:opacity-50 shrink-0",
          children: stoppingWorker ? "Stopping..." : "Stop"
        }
      ),
      /* @__PURE__ */ jsxs(
        "select",
        {
          value: worker.clusterRoleId || "",
          onChange: (e) => onAssignRole(worker.id, e.target.value),
          className: "text-sm bg-background border border-input rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring shrink-0",
          children: [
            /* @__PURE__ */ jsx("option", { value: "", children: "Unassigned" }),
            roles.map((r) => /* @__PURE__ */ jsx("option", { value: r.id, children: r.roleName }, r.id))
          ]
        }
      ),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => setConfirmDelete(true),
          className: "rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-muted shrink-0",
          "aria-label": "Remove worker",
          children: /* @__PURE__ */ jsx(TrashIcon, { size: 16 })
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "mt-3 flex items-center gap-2 flex-wrap", children: [
      /* @__PURE__ */ jsx("span", { className: "text-xs text-muted-foreground", children: "Triggers:" }),
      /* @__PURE__ */ jsx("span", { className: "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-foreground/10 text-foreground", children: "Manual" }),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => toggleTrigger("cron"),
          className: `inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border transition-colors ${hasCron ? "bg-foreground text-background border-foreground" : "bg-background text-muted-foreground border-input hover:border-foreground/50"}`,
          children: "Cron"
        }
      ),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => toggleTrigger("file_watch"),
          className: `inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border transition-colors ${hasFileWatch ? "bg-foreground text-background border-foreground" : "bg-background text-muted-foreground border-input hover:border-foreground/50"}`,
          children: "File Watch"
        }
      ),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => toggleTrigger("webhook"),
          className: `inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border transition-colors ${hasWebhook ? "bg-foreground text-background border-foreground" : "bg-background text-muted-foreground border-input hover:border-foreground/50"}`,
          children: "Webhook"
        }
      )
    ] }),
    (hasCron || hasFileWatch || hasWebhook) && /* @__PURE__ */ jsxs("div", { className: "mt-3 flex flex-col gap-2", children: [
      hasCron && /* @__PURE__ */ jsxs("div", { className: "rounded-md border border-input p-2.5", children: [
        /* @__PURE__ */ jsx("label", { className: "text-xs font-medium text-muted-foreground block mb-1", children: "Cron Schedule" }),
        /* @__PURE__ */ jsx(
          "input",
          {
            type: "text",
            value: cronValue,
            onChange: (e) => setCronValue(e.target.value),
            onBlur: saveCron,
            onKeyDown: (e) => {
              if (e.key === "Enter") e.target.blur();
            },
            placeholder: "*/5 * * * *",
            className: "text-sm bg-background border border-input rounded px-2 py-1 w-full focus:outline-none focus:ring-2 focus:ring-ring font-mono"
          }
        )
      ] }),
      hasFileWatch && /* @__PURE__ */ jsxs("div", { className: "rounded-md border border-input p-2.5", children: [
        /* @__PURE__ */ jsx("label", { className: "text-xs font-medium text-muted-foreground block mb-1", children: "Watch Paths" }),
        /* @__PURE__ */ jsx(
          "input",
          {
            type: "text",
            value: fileWatchValue,
            onChange: (e) => setFileWatchValue(e.target.value),
            onBlur: saveFileWatch,
            onKeyDown: (e) => {
              if (e.key === "Enter") e.target.blur();
            },
            placeholder: "shared/inbox, shared/reports",
            className: "text-sm bg-background border border-input rounded px-2 py-1 w-full focus:outline-none focus:ring-2 focus:ring-ring font-mono"
          }
        ),
        /* @__PURE__ */ jsx("p", { className: "text-xs text-muted-foreground mt-1", children: "Comma-separated paths relative to cluster data dir." })
      ] }),
      hasWebhook && /* @__PURE__ */ jsx(WebhookInfo, { workerId: worker.id })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "mt-3", children: /* @__PURE__ */ jsxs("div", { className: "rounded-md border border-input p-2.5", children: [
      /* @__PURE__ */ jsx("label", { className: "text-xs font-medium text-muted-foreground block mb-1", children: "Folders" }),
      /* @__PURE__ */ jsx(
        "input",
        {
          type: "text",
          value: foldersValue,
          onChange: (e) => setFoldersValue(e.target.value),
          onBlur: saveFolders,
          onKeyDown: (e) => {
            if (e.key === "Enter") e.target.blur();
          },
          placeholder: "inbox, output",
          className: "text-sm bg-background border border-input rounded px-2 py-1 w-full focus:outline-none focus:ring-2 focus:ring-ring font-mono"
        }
      ),
      /* @__PURE__ */ jsxs("p", { className: "text-xs text-muted-foreground mt-1", children: [
        "Comma-separated folder names created under worker-",
        worker.replicaIndex,
        "/."
      ] })
    ] }) }),
    /* @__PURE__ */ jsx(
      ConfirmDialog,
      {
        open: confirmDelete,
        title: "Remove worker?",
        description: `This will remove "${worker.name || `Worker ${worker.replicaIndex}`}" from the cluster.`,
        confirmLabel: "Remove",
        onConfirm: () => {
          setConfirmDelete(false);
          onRemove(worker.id);
        },
        onCancel: () => setConfirmDelete(false)
      }
    )
  ] });
}
function CopyButton({ text, label }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2e3);
  };
  return /* @__PURE__ */ jsx(
    "button",
    {
      onClick: copy,
      className: "inline-flex items-center justify-center rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0",
      title: copied ? "Copied!" : `Copy ${label}`,
      children: copied ? /* @__PURE__ */ jsx(CheckIcon, { size: 14 }) : /* @__PURE__ */ jsx(CopyIcon, { size: 14 })
    }
  );
}
function WebhookInfo({ workerId }) {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://your-domain.com";
  const endpoint = `${origin}/api/cluster/${workerId}/webhook`;
  const curlCmd = `curl -X POST ${endpoint} \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "Hello from webhook"}'`;
  return /* @__PURE__ */ jsxs("div", { className: "rounded-md border border-input p-2.5", children: [
    /* @__PURE__ */ jsx("label", { className: "text-xs font-medium text-muted-foreground block mb-2", children: "Webhook" }),
    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 mb-2", children: [
      /* @__PURE__ */ jsx("code", { className: "flex-1 min-w-0 text-xs bg-muted px-2 py-1.5 rounded font-mono text-foreground truncate select-all", children: endpoint }),
      /* @__PURE__ */ jsx(CopyButton, { text: endpoint, label: "endpoint" })
    ] }),
    /* @__PURE__ */ jsx("label", { className: "text-xs font-medium text-muted-foreground block mb-1 mt-2", children: "Example cURL" }),
    /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-2", children: [
      /* @__PURE__ */ jsx("pre", { className: "flex-1 min-w-0 text-xs bg-muted/70 border border-input rounded-md px-2.5 py-2 font-mono text-foreground overflow-x-auto whitespace-pre-wrap break-all leading-relaxed", children: curlCmd }),
      /* @__PURE__ */ jsx(CopyButton, { text: curlCmd, label: "curl command" })
    ] })
  ] });
}
export {
  ClusterPage
};
