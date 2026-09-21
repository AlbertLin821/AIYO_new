import type { StatusStepPayload } from "@/types";

type ChatProgressSession = {
  text: string;
  textListeners: Set<(text: string) => void>;
  events: StatusStepPayload[];
  listeners: Set<(step: StatusStepPayload) => void>;
  done: boolean;
  updatedAt: number;
};

const SESSION_TTL_MS = 10 * 60 * 1000;
const progressGlobal = globalThis as typeof globalThis & {
  aiyoChatProgress?: { sessions: Map<string, ChatProgressSession>; owners: Map<string, string> };
};
const sharedProgress = progressGlobal.aiyoChatProgress ??= {
  sessions: new Map<string, ChatProgressSession>(), owners: new Map<string, string>(),
};
const progressSessions = sharedProgress.sessions;
const sessionOwners = sharedProgress.owners;

function pruneSessionOwner(sessionId: string) {
  if (!progressSessions.has(sessionId)) {
    sessionOwners.delete(sessionId);
  }
}

function pruneExpiredSessions() {
  const now = Date.now();
  for (const [sessionId, session] of progressSessions.entries()) {
    if (now - session.updatedAt > SESSION_TTL_MS) {
      progressSessions.delete(sessionId);
      sessionOwners.delete(sessionId);
    }
  }
}

function getOrCreateSession(sessionId: string): ChatProgressSession {
  pruneExpiredSessions();
  const existing = progressSessions.get(sessionId);
  if (existing) {
    existing.updatedAt = Date.now();
    return existing;
  }
  const created: ChatProgressSession = {
    text: "",
    textListeners: new Set(),
    events: [],
    listeners: new Set(),
    done: false,
    updatedAt: Date.now(),
  };
  progressSessions.set(sessionId, created);
  return created;
}

export function ensureChatProgressSession(sessionId: string, ownerUserId?: string): void {
  const owner = sessionOwners.get(sessionId);
  if (owner && ownerUserId && owner !== ownerUserId) throw new Error("forbidden");
  getOrCreateSession(sessionId);
  if (ownerUserId) {
    sessionOwners.set(sessionId, ownerUserId);
  }
}

export function canAccessChatProgressSession(sessionId: string, userId: string): boolean {
  const owner = sessionOwners.get(sessionId);
  if (!owner) {
    return false;
  }
  return owner === userId;
}

export function listChatProgressEvents(sessionId: string): StatusStepPayload[] {
  return [...getOrCreateSession(sessionId).events];
}

export function isChatProgressDone(sessionId: string): boolean {
  return getOrCreateSession(sessionId).done;
}

export function publishChatProgress(sessionId: string, step: StatusStepPayload): void {
  const session = getOrCreateSession(sessionId);
  const nextEvents = session.events.filter(
    (item) =>
      !(
        item.phase === step.phase &&
        item.label === step.label &&
        item.provider === step.provider &&
        item.query === step.query
      ),
  );
  nextEvents.push(step);
  session.events = nextEvents;
  session.updatedAt = Date.now();
  for (const listener of session.listeners) {
    listener(step);
  }
}

export function completeChatProgress(sessionId: string): void {
  const session = getOrCreateSession(sessionId);
  session.done = true;
  session.updatedAt = Date.now();
}

export function subscribeChatProgress(
  sessionId: string,
  listener: (step: StatusStepPayload) => void,
): () => void {
  const session = getOrCreateSession(sessionId);
  session.listeners.add(listener);
  session.updatedAt = Date.now();
  return () => {
    session.listeners.delete(listener);
    session.updatedAt = Date.now();
    pruneSessionOwner(sessionId);
  };
}

export function publishChatText(sessionId: string, text: string) {
  const session = getOrCreateSession(sessionId);
  session.text = text.slice(0, 16000);
  session.updatedAt = Date.now();
  for (const listener of session.textListeners) listener(session.text);
}
export function getChatText(sessionId: string) { return getOrCreateSession(sessionId).text; }
export function subscribeChatText(sessionId: string, listener: (text: string) => void) {
  const session = getOrCreateSession(sessionId);
  session.textListeners.add(listener);
  return () => { session.textListeners.delete(listener); };
}
