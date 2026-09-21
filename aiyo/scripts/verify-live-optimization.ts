import assert from "node:assert/strict";
import { request } from "@playwright/test";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { loadProjectEnvIntoProcess } from "../src/lib/projectEnv";
loadProjectEnvIntoProcess(process.cwd(), { override: false });
if (process.env.DATABASE_URL) { const url = new URL(process.env.DATABASE_URL); url.hostname = "127.0.0.1"; process.env.DATABASE_URL = url.toString(); }
async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const email = `verification-${randomUUID()}@example.invalid`;
  const password = randomUUID();
  const user = await prisma.user.create({ data: { email, name: "Optimization verification", passwordHash: await bcrypt.hash(password, 10) } });
  const api = await request.newContext({ baseURL: "http://127.0.0.1:3000", timeout: 240000 });
  try {
    const csrf = await (await api.get("/api/auth/csrf")).json();
    await api.post("/api/auth/callback/credentials", { form: { csrfToken: csrf.csrfToken, email, password, json: "true" } });
    const session = await (await api.get("/api/auth/session")).json();
    assert.equal(session.user.id, user.id);
    const id = `verify-${randomUUID()}`;
    assert.ok((await api.post("/api/chat/stream/register", { data: { sessionId: id } })).ok());
    const cookie = (await api.storageState()).cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const controller = new AbortController();
    const stream = await fetch(`http://127.0.0.1:3000/api/chat/stream/${id}`, { headers: { cookie }, signal: controller.signal });
    assert.equal(stream.status, 200);
    const reader = stream.body!.getReader();
    let streamText = "";
    const reading = (async () => { try { while (true) { const item = await reader.read(); if (item.done) break; streamText += new TextDecoder().decode(item.value); } } catch { /* explicit end */ } })();
    const started = Date.now();
    const chat = await api.post("/api/ai/chat", { data: { message: "請解釋自由行如何預留轉乘緩衝時間，給我三個簡短原則，不用查詢即時資料。", progressSessionId: id } });
    const result = await chat.json();
    console.info(JSON.stringify({ chatStatus: chat.status(), elapsedMs: Date.now() - started, replyType: result.data?.reply?.responseType, replyLength: result.data?.reply?.content?.length, hasProgress: streamText.includes("status_step"), textSnapshots: (streamText.match(/event: text_snapshot/g) || []).length }));
    controller.abort(); await reading;
    assert.ok(chat.ok()); assert.ok(result.data?.reply?.content);
    const queued = await api.post("/api/videos/summarize", { headers: { Prefer: "respond-async" }, data: { videoId: "BAyQ10iPK4M", destination: "嘉義" } });
    assert.equal(queued.status(), 202);
    const jobId = (await queued.json()).data.jobId;
    console.info(JSON.stringify({ videoJobId: jobId, accepted: true }));
    const deadline = Date.now() + 240000;
    let completed = false;
    while (Date.now() < deadline) {
      const status = await (await api.get(`/api/videos/jobs/${jobId}`)).json();
      console.info(JSON.stringify({ state: status.data?.state, progress: status.data?.progress }));
      if (status.data?.state === "completed") {
        completed = true;
        console.info(JSON.stringify({ completed: true, summaryLength: status.data.result.summary.length, segments: status.data.result.segments.length, locations: status.data.result.extractedLocations.length, source: status.data.result.transcriptSource }));
        break;
      }
      if (status.data?.state === "failed") throw new Error("Live video job failed");
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }
    assert.ok(completed, "Live video job did not complete before the deadline");
  } finally { await api.dispose(); await prisma.$disconnect(); }
}
void main().catch((error) => { console.error(error.message); process.exit(1); });
