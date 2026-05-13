import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "@/app/api/trip/revise/route";

test("POST /api/trip/revise validates empty instruction", async () => {
  const response = await POST(
    new Request("http://localhost/api/trip/revise", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction: "   " }),
    }),
  );

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.success, false);
  assert.equal(payload.error.code, "invalid_request");
});

test("POST /api/trip/revise requires trip profile", async () => {
  const response = await POST(
    new Request("http://localhost/api/trip/revise", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction: "放慢步調" }),
    }),
  );

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.success, false);
  assert.equal(payload.error.code, "invalid_request");
});
