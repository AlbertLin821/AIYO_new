export type SyncMutationSource =
  | "bootstrap"
  | "realtime"
  | "local-user-edit"
  | "server-ack";

const stack: SyncMutationSource[] = [];

export function getSyncMutationSource(): SyncMutationSource | null {
  if (stack.length === 0) {
    return null;
  }
  return stack[stack.length - 1] ?? null;
}

export function withSyncMutationSource<T>(source: SyncMutationSource, fn: () => T): T {
  stack.push(source);
  try {
    return fn();
  } finally {
    stack.pop();
  }
}

export function shouldScheduleTripSync(): boolean {
  return getSyncMutationSource() === "local-user-edit";
}
