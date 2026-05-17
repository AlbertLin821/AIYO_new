import type { StatusStepPayload } from "@/types";

type ChatProgressSession = {
  events: StatusStepPayload[];
  listeners: Set<(step: StatusStepPayload) => void>;
  done: boolean;
  updatedAt: number;
};

const SESSION_TTL_MS = 10 * 60 * 1000;
const progressSessions = new Map<string, ChatProgressSession>();

function pruneExpiredSessions() {
  const now = Date.now();
  for (const [sessionId, session] of progressSessions.entries()) {
    if (session.done && now - session.updatedAt > SESSION_TTL_MS) {
      progressSessions.delete(sessionId);
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
    events: [],
    listeners: new Set(),
    done: false,
    updatedAt: Date.now(),
  };
  progressSessions.set(sessionId, created);
  return created;
}

export function ensureChatProgressSession(sessionId: string): void {
  getOrCreateSession(sessionId);
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
  };
}
