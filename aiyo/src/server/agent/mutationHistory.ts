import { prisma } from "@/lib/prisma";
import { canCollaborator } from "@/lib/permissions";
import type { Prisma } from "@prisma/client";
import { applySnapshotPatch } from "./snapshotPatch";
import type { PersistedTripPayload } from "@/types";

function snapshot(value: unknown, tripId: string): PersistedTripPayload {
  const parsed = value as PersistedTripPayload | null;
  if (!parsed || parsed.tripId !== tripId || !Array.isArray(parsed.itinerary) || !Array.isArray(parsed.pins)) throw new Error("invalid_agent_proposal");
  return parsed;
}

async function requireEditor(tx: Prisma.TransactionClient, userId: string, tripId: string) {
  const trip = await tx.trip.findUnique({ where: { id: tripId }, select: { userId: true, collaborators: { where: { userId }, select: { role: true } } } });
  if (!trip) throw new Error("not_found");
  if (trip.userId === userId) return;
  const role = trip.collaborators[0]?.role;
  if (role !== "editor" || !canCollaborator(role, "edit")) throw new Error("forbidden");
}

async function recoverConcurrentReplay(error: unknown, userId: string, tripId: string, mutationId: string, idempotencyKey: string, source: "agent_undo" | "agent_redo") {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : null;
  const message = error instanceof Error ? error.message : "";
  if (!["version_conflict", "not_found"].includes(message) && !["P2002", "P2034"].includes(code || "")) return null;
  const duplicate = await prisma.tripMutation.findUnique({ where: { tripId_idempotencyKey: { tripId, idempotencyKey } } });
  if (!duplicate) return null;
  const ref = duplicate.operationsJson as { undoOf?: string; redoOf?: string } | null;
  const target = source === "agent_undo" ? ref?.undoOf : ref?.redoOf;
  if (duplicate.actorId !== userId || duplicate.source !== source || target !== mutationId) throw new Error("idempotency_conflict");
  return { trip: snapshot(duplicate.afterSnapshot, tripId), revision: duplicate.resultRevision, mutationId: duplicate.id };
}

export async function undoAgentMutation(userId: string, tripId: string, mutationId: string, baseRevision: number, idempotencyKey: string) {
  try { return await prisma.$transaction(async (tx) => {
    await requireEditor(tx, userId, tripId);
    const duplicate = await tx.tripMutation.findUnique({ where: { tripId_idempotencyKey: { tripId, idempotencyKey } } });
    if (duplicate) {
      const ref = duplicate.operationsJson as { undoOf?: string } | null;
      if (duplicate.actorId !== userId || duplicate.source !== "agent_undo" || ref?.undoOf !== mutationId) throw new Error("idempotency_conflict");
      return { trip: snapshot(duplicate.afterSnapshot, tripId), revision: duplicate.resultRevision, mutationId: duplicate.id };
    }
    const original = await tx.tripMutation.findFirst({ where: { id: mutationId, tripId, actorId: userId, source: "agent", undoneAt: null } });
    if (!original) throw new Error("not_found");
    const current = await tx.trip.findUniqueOrThrow({ where: { id: tripId }, select: { revision: true } });
    if (current.revision !== baseRevision || current.revision !== original.resultRevision) throw new Error("version_conflict");
    const before = snapshot(original.beforeSnapshot, tripId);
    const after = snapshot(original.afterSnapshot, tripId);
    const changed = await tx.trip.updateMany({ where: { id: tripId, revision: baseRevision }, data: { revision: { increment: 1 } } });
    if (!changed.count) throw new Error("version_conflict");
    await applySnapshotPatch(tx, tripId, before);
    const restored = { ...before, revision: baseRevision + 1, updatedAt: new Date().toISOString() };
    const mutation = await tx.tripMutation.create({ data: {
      tripId, actorId: userId, baseRevision, resultRevision: baseRevision + 1, idempotencyKey,
      source: "agent_undo", beforeSnapshot: JSON.parse(JSON.stringify(after)), afterSnapshot: JSON.parse(JSON.stringify(restored)),
      operationsJson: { undoOf: mutationId }, inverseJson: { redoOf: mutationId },
    } });
    await tx.tripMutation.update({ where: { id: original.id }, data: { undoneAt: new Date() } });
    return { trip: restored, revision: restored.revision, mutationId: mutation.id };
  }, { timeout: 30_000 });
  } catch (error) {
    const replay = await recoverConcurrentReplay(error, userId, tripId, mutationId, idempotencyKey, "agent_undo");
    if (replay) return replay;
    throw error;
  }
}

export async function redoAgentMutation(userId: string, tripId: string, mutationId: string, baseRevision: number, idempotencyKey: string) {
  try { return await prisma.$transaction(async (tx) => {
    await requireEditor(tx, userId, tripId);
    const duplicate = await tx.tripMutation.findUnique({ where: { tripId_idempotencyKey: { tripId, idempotencyKey } } });
    if (duplicate) {
      const ref = duplicate.operationsJson as { redoOf?: string } | null;
      if (duplicate.actorId !== userId || duplicate.source !== "agent_redo" || ref?.redoOf !== mutationId) throw new Error("idempotency_conflict");
      return { trip: snapshot(duplicate.afterSnapshot, tripId), revision: duplicate.resultRevision, mutationId: duplicate.id };
    }
    const original = await tx.tripMutation.findFirst({ where: { id: mutationId, tripId, actorId: userId, source: "agent", undoneAt: { not: null } } });
    if (!original) throw new Error("not_found");
    const undo = await tx.tripMutation.findFirst({ where: { tripId, actorId: userId, source: "agent_undo", operationsJson: { path: ["undoOf"], equals: mutationId } }, orderBy: { createdAt: "desc" } });
    if (!undo) throw new Error("not_found");
    const current = await tx.trip.findUniqueOrThrow({ where: { id: tripId }, select: { revision: true } });
    if (current.revision !== baseRevision || current.revision !== undo.resultRevision) throw new Error("version_conflict");
    const after = snapshot(original.afterSnapshot, tripId);
    const before = snapshot(undo.afterSnapshot, tripId);
    const changed = await tx.trip.updateMany({ where: { id: tripId, revision: baseRevision }, data: { revision: { increment: 1 } } });
    if (!changed.count) throw new Error("version_conflict");
    await applySnapshotPatch(tx, tripId, after);
    const reapplied = { ...after, revision: baseRevision + 1, updatedAt: new Date().toISOString() };
    const mutation = await tx.tripMutation.create({ data: {
      tripId, actorId: userId, baseRevision, resultRevision: baseRevision + 1, idempotencyKey,
      source: "agent_redo", beforeSnapshot: JSON.parse(JSON.stringify(before)), afterSnapshot: JSON.parse(JSON.stringify(reapplied)),
      operationsJson: { redoOf: mutationId }, inverseJson: { undoOf: mutationId },
    } });
    return { trip: reapplied, revision: reapplied.revision, mutationId: mutation.id };
  }, { timeout: 30_000 });
  } catch (error) {
    const replay = await recoverConcurrentReplay(error, userId, tripId, mutationId, idempotencyKey, "agent_redo");
    if (replay) return replay;
    throw error;
  }
}
