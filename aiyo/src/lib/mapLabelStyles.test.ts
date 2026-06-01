import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMapLabelStyles,
  DEFAULT_MAP_LABEL_VISIBILITY,
  normalizeMapLabelVisibility,
} from "./mapLabelStyles";

test("buildMapLabelStyles returns no rules when all labels visible", () => {
  assert.deepEqual(buildMapLabelStyles(DEFAULT_MAP_LABEL_VISIBILITY), []);
});

test("buildMapLabelStyles hides highway labels when highway toggle off", () => {
  const rules = buildMapLabelStyles({ ...DEFAULT_MAP_LABEL_VISIBILITY, highway: false });
  assert.equal(
    rules.some((rule) => rule.featureType === "road.highway"),
    true,
  );
});

test("buildMapLabelStyles hides arterial and local labels when road toggle off", () => {
  const rules = buildMapLabelStyles({ ...DEFAULT_MAP_LABEL_VISIBILITY, road: false });
  assert.equal(
    rules.some((rule) => rule.featureType === "road.arterial"),
    true,
  );
  assert.equal(
    rules.some((rule) => rule.featureType === "road.local"),
    true,
  );
});

test("normalizeMapLabelVisibility defaults missing keys to visible", () => {
  assert.deepEqual(normalizeMapLabelVisibility({ highway: false }), {
    highway: false,
    road: true,
    poi: true,
    administrative: true,
  });
});
