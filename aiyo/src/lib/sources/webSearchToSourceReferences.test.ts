import assert from "node:assert/strict";
import test from "node:test";
import { webSearchResultsToSourceReferences } from "@/lib/sources/webSearchToSourceReferences";

test("webSearchResultsToSourceReferences maps to website SourceReference", () => {
  const refs = webSearchResultsToSourceReferences([
    {
      title: "Example",
      url: "https://travel.example.com/page",
      content: "snippet text",
      engine: "searxng",
    },
  ]);
  assert.equal(refs.length, 1);
  assert.equal(refs[0]?.type, "website");
  assert.equal(refs[0]?.title, "Example");
  assert.match(refs[0]?.url || "", /travel\.example\.com/);
});
