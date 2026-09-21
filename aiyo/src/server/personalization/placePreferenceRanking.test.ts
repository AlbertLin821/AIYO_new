import assert from "node:assert/strict";
import test from "node:test";
import { rankPlaceCandidates, resolveCandidatePreferences } from "./placePreferenceRanking";

const museum = { name: "東京國立博物館", types: ["museum"] };
const cafe = { name: "Blue Bottle", types: ["cafe"] };
const mall = { name: "Tokyo Mall", types: ["shopping_mall"] };

test("candidate ranking uses known interests but prioritizes explicit must-visit places", () => {
  assert.deepEqual(rankPlaceCandidates([museum, cafe, mall], {
    interests: ["美食"], mustVisit: ["Tokyo Mall"],
  }), [mall, cafe, museum]);
});

test("avoidances remove named places and known categories, even conflicting must-visits", () => {
  assert.deepEqual(rankPlaceCandidates([museum, cafe, mall], {
    avoid: ["Blue Bottle", "購物"], mustVisit: ["Tokyo Mall"],
  }), [museum]);
});

test("current fields replace saved preferences and explicit empty arrays clear restrictions", () => {
  assert.deepEqual(rankPlaceCandidates([museum, cafe, mall], {
    interests: ["美食"], avoid: ["購物"], mustVisit: ["Blue Bottle"],
  }, { interests: ["購物"], avoid: [], mustVisit: [] }), [mall, museum, cafe]);
  assert.deepEqual(resolveCandidatePreferences({ interests: ["美食"], budget: 100 }, { budget: undefined }), {
    interests: ["美食"], budget: 100,
  });
});

test("unknown metadata does not invent diet, budget, pace, transport or visited compatibility", () => {
  const candidates = [{ name: "Alpha" }, { name: "Beta", types: ["restaurant"] }];
  assert.deepEqual(rankPlaceCandidates(candidates, {
    interests: ["素食", "便宜"], budget: 100, pace: "relaxed", transportPreference: "walk",
  }), candidates);
});

test("equal matches preserve provider order without mutating candidates or preferences", () => {
  const candidates = Object.freeze([cafe, { name: "Other Cafe", types: ["cafe"] }, museum]);
  const preferences = Object.freeze({ interests: ["美食", "美食"] });
  assert.deepEqual(rankPlaceCandidates(candidates, preferences), candidates);
  assert.equal(candidates[0], cafe);
});

test("Latin matching respects token boundaries and must-visit does not expand categories", () => {
  const candidates = [{ name: "Mart", types: ["store"] }, { name: "Art House" }, cafe];
  assert.deepEqual(rankPlaceCandidates(candidates, { interests: ["art"] }), [candidates[1], candidates[0], cafe]);
  assert.deepEqual(rankPlaceCandidates(candidates, { mustVisit: ["food"] }), candidates);
});

test("separate users can rank the same raw cached candidates independently", () => {
  const cached = [museum, cafe, mall];
  assert.deepEqual(rankPlaceCandidates(cached, { interests: ["美食"] }), [cafe, museum, mall]);
  assert.deepEqual(rankPlaceCandidates(cached, { interests: ["購物"] }), [mall, museum, cafe]);
  assert.deepEqual(cached, [museum, cafe, mall]);
});
