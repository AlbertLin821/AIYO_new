import { describe, expect, it } from "vitest";
import {
  buildMapLabelStyles,
  DEFAULT_MAP_LABEL_VISIBILITY,
  normalizeMapLabelVisibility,
} from "./mapLabelStyles";

describe("buildMapLabelStyles", () => {
  it("returns no rules when all labels visible", () => {
    expect(buildMapLabelStyles(DEFAULT_MAP_LABEL_VISIBILITY)).toEqual([]);
  });

  it("hides highway labels when highway toggle off", () => {
    const rules = buildMapLabelStyles({ ...DEFAULT_MAP_LABEL_VISIBILITY, highway: false });
    expect(rules.some((rule) => rule.featureType === "road.highway")).toBe(true);
  });

  it("hides arterial and local labels when road toggle off", () => {
    const rules = buildMapLabelStyles({ ...DEFAULT_MAP_LABEL_VISIBILITY, road: false });
    expect(rules.some((rule) => rule.featureType === "road.arterial")).toBe(true);
    expect(rules.some((rule) => rule.featureType === "road.local")).toBe(true);
  });
});

describe("normalizeMapLabelVisibility", () => {
  it("defaults missing keys to visible", () => {
    expect(normalizeMapLabelVisibility({ highway: false })).toEqual({
      highway: false,
      road: true,
      poi: true,
      administrative: true,
    });
  });
});
