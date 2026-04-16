import { create } from "zustand";
import type { CollabMember, CollaborationPresenceState, EditingPresence, StickyCommentData } from "@/types";

interface CollabState {
  roomId: string | null;
  members: CollabMember[];
  comments: StickyCommentData[];
  presence: EditingPresence[];
  inviteCode: string;
  shareLink: string;
  connectionStatus: "idle" | "connecting" | "connected" | "reconnecting" | "disconnected";
  setCollaboration: (state: CollaborationPresenceState) => void;
  setConnectionStatus: (status: CollabState["connectionStatus"]) => void;
  addComment: (comment: StickyCommentData) => void;
  removeComment: (id: string) => void;
  updateMemberRole: (id: string, role: CollabMember["role"]) => void;
  removeMember: (id: string) => void;
}

export const useCollabStore = create<CollabState>((set) => ({
  roomId: null,
  members: [],
  comments: [],
  presence: [],
  inviteCode: "",
  shareLink: "",
  connectionStatus: "idle",
  setCollaboration: (state) =>
    set({
      roomId: state.roomId,
      members: state.members,
      comments: state.comments,
      presence: state.presence,
      inviteCode: state.inviteCode,
      shareLink: state.shareLink,
    }),
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
  addComment: (comment) => set((state) => ({ comments: [...state.comments, comment] })),
  removeComment: (id) => set((state) => ({ comments: state.comments.filter((comment) => comment.id !== id) })),
  updateMemberRole: (id, role) =>
    set((state) => ({
      members: state.members.map((member) => (member.id === id ? { ...member, role } : member)),
    })),
  removeMember: (id) => set((state) => ({ members: state.members.filter((member) => member.id !== id) })),
}));
