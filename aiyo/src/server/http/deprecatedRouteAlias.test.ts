import assert from "node:assert/strict";
import test from "node:test";
import { deprecatedRouteAlias } from "./deprecatedRouteAlias";

test("deprecated route alias preserves response and advertises canonical route", async () => {
  const handler = deprecatedRouteAlias(async () => Response.json({ ok: true }, { status: 201 }), "/api/new");
  const response = await handler(new Request("http://local/api/old"));
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("Deprecation"), "true");
  assert.equal(response.headers.get("Link"), '</api/new>; rel="successor-version"');
  assert.deepEqual(await response.json(), { ok: true });
});
