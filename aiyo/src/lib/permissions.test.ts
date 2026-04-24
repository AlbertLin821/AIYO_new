import assert from "node:assert/strict";
import test from "node:test";
import { canCollaborator } from "@/lib/permissions";

test("owner can manage permissions", () => {
  assert.equal(canCollaborator("owner", "managePermissions"), true);
});

test("editor can edit but cannot manage permissions", () => {
  assert.equal(canCollaborator("editor", "edit"), true);
  assert.equal(canCollaborator("editor", "managePermissions"), false);
});

test("viewer can only view", () => {
  assert.equal(canCollaborator("viewer", "view"), true);
  assert.equal(canCollaborator("viewer", "edit"), false);
});
