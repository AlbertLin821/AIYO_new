import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "@/app/api/sources/[sourceId]/preview/route";
import { registerChatSources } from "@/server/chat/sourcePreviewStore";

test("GET /api/sources/[sourceId]/preview returns registered source", async () => {
  registerChatSources({
    src_001: {
      source_id: "src_001",
      type: "web",
      provider: "demo",
      title: "熊本旅遊",
      url: "https://example.com/kumamoto",
      domain: "example.com",
      snippet: "snippet",
      preview_text: "preview",
      retrieved_at: new Date().toISOString(),
      reliability: "high",
      language: "zh-TW",
    },
  });

  const response = await GET(new Request("http://localhost/api/sources/src_001/preview"), {
    params: Promise.resolve({ sourceId: "src_001" }),
  });
  assert.equal(response.status, 200);
});
