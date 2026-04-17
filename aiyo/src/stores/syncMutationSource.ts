export type SyncMutationSource =
  | "bootstrap"
  | "realtime"
  | "local-user-edit"
  | "server-ack";

let depth = 0;
let stack: SyncMutationSource[] = [];

export function getSyncMutationSource(): SyncMutationSource | null {
  if (stack.length === 0) {
    return null;
  }
  return stack[stack.length - 1] ?? null;
}

export function withSyncMutationSource<T>(source: SyncMutationSource, fn: () => T): T {
  depth += 1;
  stack.push(source);
  try {
    return fn();
  } finally {
    stack.pop();
    depth -= 1;
  }
}

export function shouldScheduleTripSync(): boolean {
  return getSyncMutationSource() === "local-user-edit";
}
