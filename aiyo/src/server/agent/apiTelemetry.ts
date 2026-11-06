export async function observeAgentApi(operation: "preview" | "apply", handler: () => Promise<Response>): Promise<Response> {
  const startedAt = performance.now();
  let status = 500;
  try {
    const response = await handler();
    status = response.status;
    return response;
  } finally {
    console.info("[agent-api]", JSON.stringify({
      operation,
      status,
      durationMs: Math.round(performance.now() - startedAt),
    }));
  }
}
