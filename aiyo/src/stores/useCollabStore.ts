import { create } from 'zustand';
import type { CollabMember, StickyCommentData, EditingPresence } from '@/lib/types';
import { mockCollabMembers, mockStickyComments, mockPresence } from '@/lib/mock-data';

interface CollabState {
  members: CollabMember[];
  comments: StickyCommentData[];
  presence: EditingPresence[];
  inviteCode: string;
  shareLink: string;
  addComment: (comment: StickyCommentData) => void;
  removeComment: (id: string) => void;
  updateMemberRole: (id: string, role: CollabMember['role']) => void;
  removeMember: (id: string) => void;
}

export const useCollabStore = create<CollabState>((set) => ({
  members: mockCollabMembers,
  comments: mockStickyComments,
  presence: mockPresence,
  inviteCode: 'AIYO-TK5D-2024',
  shareLink: 'https://aiyo.app/join/AIYO-TK5D-2024',
  addComment: (comment) =>
    set((s) => ({ comments: [...s.comments, comment] })),
  removeComment: (id) =>
    set((s) => ({ comments: s.comments.filter((c) => c.id !== id) })),
  updateMemberRole: (id, role) =>
    set((s) => ({
      members: s.members.map((m) => (m.id === id ? { ...m, role } : m)),
    })),
  removeMember: (id) =>
    set((s) => ({ members: s.members.filter((m) => m.id !== id) })),
}));
