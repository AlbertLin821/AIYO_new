import assert from "node:assert/strict";
import test from "node:test";
import { photonSearch, photonReverse } from "./photon";

test("unsupported Photon locale retries search and reverse with server default", async () => {
  const originalFetch = globalThis.fetch;
  const requests: URL[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    requests.push(url);
    return url.searchParams.has("lang")
      ? Response.json({ lang: [{ message: "Language is not supported. Supported are: default, de, en, fr" }] }, { status: 400 })
      : Response.json({ features: [{ geometry: { coordinates: [121.5, 25] }, properties: { name: "台北", osm_id: 1 } }] });
  };
  try {
    assert.equal((await photonSearch("https://example.test", "台北", { language: "zh-TW" }))[0].name, "台北");
    assert.equal((await photonReverse("https://example.test", { lat: 25, lng: 121.5 }, "zh-TW"))?.name, "台北");
    assert.equal(requests.length, 4);
    assert.equal(requests[1].searchParams.get("q"), "台北");
    assert.equal(requests[1].searchParams.has("lang"), false);
    assert.equal(requests[3].searchParams.get("lat"), "25");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
