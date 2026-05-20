export type ToolCallRecord = {
  id: string;
  toolName: string;
  status: "pending" | "running" | "success" | "error";
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  errorMessage?: string;
  startedAt?: string;
  endedAt?: string;
};
