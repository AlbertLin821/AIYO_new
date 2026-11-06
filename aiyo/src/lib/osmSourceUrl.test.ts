import assert from "node:assert/strict";
import test from "node:test";
import { osmSourceUrl } from "./osmSourceUrl";

test("builds OSM source links only for numeric OSM identifiers", () => {
  assert.equal(osmSourceUrl("W:123"), "https://www.openstreetmap.org/way/123");
  assert.equal(osmSourceUrl("overpass:node:456"), "https://www.openstreetmap.org/node/456");
  assert.equal(osmSourceUrl("photon:R:789"), "https://www.openstreetmap.org/relation/789");
  assert.equal(osmSourceUrl("legacy-google-id"), null);
  assert.equal(osmSourceUrl("way:1/path"), null);
});
