/** Decode provider transport frames; reasoning fields are intentionally ignored. */
export async function readModelStream(response: Response, mode: "ollama" | "openai", onChunk: (chunk: string) => void): Promise<string> {
  if (!response.body) throw new Error("Missing model response stream");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  const consume = (line: string) => {
    const raw = line.trim();
    if (!raw || raw.startsWith(":")) return;
    if (mode === "openai" && !raw.startsWith("data:")) return;
    const data = mode === "openai" ? raw.slice(5).trim() : raw;
    if (data === "[DONE]") return;
    const frame = JSON.parse(data);
    if (frame.error) throw new Error("Model stream failed");
    const chunk = mode === "ollama" ? frame.message?.content : frame.choices?.[0]?.delta?.content;
    if (typeof chunk === "string") { content += chunk; onChunk(chunk); }
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n"); buffer = lines.pop() || "";
      for (const line of lines) consume(line);
      if (done) break;
    }
    if (buffer.trim()) consume(buffer);
    return content;
  } finally { reader.releaseLock(); }
}
