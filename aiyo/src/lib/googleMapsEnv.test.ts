import assert from "node:assert/strict";
import test from "node:test";

import { resolveGoogleMapsApiKey, resolveGoogleMapsMapId } from "./googleMapsEnv";

test("resolveGoogleMapsApiKey prefers server key when both differ", () => {
  assert.equal(
    resolveGoogleMapsApiKey({
      GOOGLE_MAPS_API_KEY: "server-key",
      NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: "client-key",
      NODE_ENV: "development",
    }),
    "server-key",
  );
});

test("resolveGoogleMapsApiKey falls back to client-only key", () => {
  assert.equal(
    resolveGoogleMapsApiKey({
      NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: "client-only",
    }),
    "client-only",
  );
});

test("resolveGoogleMapsMapId rejects placeholder values", () => {
  assert.equal(
    resolveGoogleMapsMapId({
      NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID: "Frontend_NEXT_PUBLIC_GOOGLE_MAPS_API_KEY",
    }),
    "",
  );
  assert.equal(
    resolveGoogleMapsMapId({
      NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID: "abc123def456",
    }),
    "abc123def456",
  );
});
