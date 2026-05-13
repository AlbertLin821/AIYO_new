"use client";

type FrontendProcessStatus = "running" | "completed" | "failed";

type FrontendDebugProcess = {
  id: string;
  scope: string;
  label: string;
  status: FrontendProcessStatus;
  startedAt: string;
  updatedAt: string;
  meta?: Record<string, unknown>;
};

type FrontendDebugStore = {
  processes: Record<string, FrontendDebugProcess>;
};

declare global {
  interface Window {
    __AIYO_FRONTEND_DEBUG__?: FrontendDebugStore;
  }
}

const PREFIX = "[frontend-debug]";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function nowIso(): string {
  return new Date().toISOString();
}

function safeMeta(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!meta) {
    return undefined;
  }
  return JSON.parse(JSON.stringify(meta)) as Record<string, unknown>;
}

function getStore(): FrontendDebugStore | null {
  if (!isBrowser()) {
    return null;
  }
  if (!window.__AIYO_FRONTEND_DEBUG__) {
    window.__AIYO_FRONTEND_DEBUG__ = { processes: {} };
  }
  return window.__AIYO_FRONTEND_DEBUG__;
}

function activeProcessSnapshot() {
  const store = getStore();
  if (!store) {
    return [];
  }
  return Object.values(store.processes).map((process) => ({
    id: process.id,
    scope: process.scope,
    label: process.label,
    status: process.status,
    updatedAt: process.updatedAt,
    meta: process.meta,
  }));
}

function emit(
  level: "info" | "warn" | "error",
  message: string,
  payload?: Record<string, unknown>,
) {
  if (!isBrowser()) {
    return;
  }
  const consoleMethod = console[level] ?? console.log;
  consoleMethod(`${PREFIX} ${message}`, payload || {});
}

function emitSnapshot(reason: string) {
  emit("info", `active-processes:${reason}`, {
    activeProcesses: activeProcessSnapshot(),
  });
}

function isExpectedTransientFailure(errorMessage: string): boolean {
  return /timed out|timeout|ollama request timed out/i.test(errorMessage);
}

export function startFrontendDebugProcess(
  scope: string,
  label: string,
  meta?: Record<string, unknown>,
): string {
  const store = getStore();
  const id = `${scope}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  if (!store) {
    return id;
  }
  const timestamp = nowIso();
  store.processes[id] = {
    id,
    scope,
    label,
    status: "running",
    startedAt: timestamp,
    updatedAt: timestamp,
    meta: safeMeta(meta),
  };
  emit("info", `${scope}:start`, {
    id,
    label,
    meta: safeMeta(meta),
  });
  emitSnapshot("start");
  return id;
}

export function updateFrontendDebugProcess(
  id: string,
  message: string,
  meta?: Record<string, unknown>,
) {
  const store = getStore();
  if (!store || !store.processes[id]) {
    return;
  }
  store.processes[id] = {
    ...store.processes[id],
    updatedAt: nowIso(),
    meta: {
      ...(store.processes[id].meta || {}),
      ...(safeMeta(meta) || {}),
    },
  };
  emit("info", `${store.processes[id].scope}:update:${message}`, {
    id,
    label: store.processes[id].label,
    meta: store.processes[id].meta,
  });
  emitSnapshot("update");
}

export function finishFrontendDebugProcess(
  id: string,
  meta?: Record<string, unknown>,
) {
  const store = getStore();
  if (!store || !store.processes[id]) {
    return;
  }
  const process = store.processes[id];
  const finalMeta = {
    ...(process.meta || {}),
    ...(safeMeta(meta) || {}),
  };
  emit("info", `${process.scope}:completed`, {
    id,
    label: process.label,
    meta: finalMeta,
  });
  delete store.processes[id];
  emitSnapshot("completed");
}

export function failFrontendDebugProcess(
  id: string,
  error: unknown,
  meta?: Record<string, unknown>,
) {
  const store = getStore();
  if (!store || !store.processes[id]) {
    return;
  }
  const process = store.processes[id];
  const finalMeta = {
    ...(process.meta || {}),
    ...(safeMeta(meta) || {}),
    error: error instanceof Error ? error.message : String(error),
  };
  emit(isExpectedTransientFailure(finalMeta.error) ? "warn" : "error", `${process.scope}:failed`, {
    id,
    label: process.label,
    meta: finalMeta,
  });
  delete store.processes[id];
  emitSnapshot("failed");
}

export function warnAndFinishFrontendDebugProcess(
  id: string,
  message: string,
  meta?: Record<string, unknown>,
) {
  const store = getStore();
  if (!store || !store.processes[id]) {
    return;
  }
  const process = store.processes[id];
  const finalMeta = {
    ...(process.meta || {}),
    ...(safeMeta(meta) || {}),
  };
  emit("warn", `${process.scope}:warning:${message}`, {
    id,
    label: process.label,
    meta: finalMeta,
  });
  delete store.processes[id];
  emitSnapshot("completed");
}

export function logFrontendDebugEvent(
  scope: string,
  event: string,
  meta?: Record<string, unknown>,
) {
  emit("info", `${scope}:event:${event}`, {
    meta: safeMeta(meta),
    activeProcesses: activeProcessSnapshot(),
  });
}
