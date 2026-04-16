"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Check,
  Copy,
  Crown,
  Link2,
  MessageSquare,
  MousePointer2,
  Plus,
  Shield,
  Users,
  Wifi,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { zhTW as t } from "@/locales/zh-TW";
import { cn } from "@/lib/utils";
import { syncService } from "@/services/syncService";
import { useCollabStore } from "@/stores/useCollabStore";
import { useToastStore } from "@/stores/useToastStore";

const roleConfig = {
  owner: { icon: Crown, label: t.collab.roleOwner, color: "text-amber-500 bg-amber-50" },
  editor: { icon: Users, label: t.collab.roleEditor, color: "text-primary bg-primary/10" },
  viewer: { icon: Shield, label: t.collab.roleViewer, color: "text-muted bg-border-light" },
};

const avatarColors = [
  "bg-secondary",
  "bg-primary",
  "bg-lavender",
  "bg-tertiary",
  "bg-peach",
];

export default function CollaboratePage() {
  const { data: session } = useSession();
  const { members, comments, presence, inviteCode, shareLink, roomId, connectionStatus, setCollaboration } =
    useCollabStore();
  const pushToast = useToastStore((state) => state.pushToast);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [newComment, setNewComment] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  function handleCopy(text: string, type: "code" | "link") {
    navigator.clipboard.writeText(text);
    setCopied(type);
    window.setTimeout(() => setCopied(null), 2000);
  }

  async function handleAddComment() {
    if (!newComment.trim() || !roomId) {
      return;
    }

    setIsSubmittingComment(true);

    try {
      const state = await syncService.addComment(roomId, newComment.trim());
      setCollaboration(state);
      setNewComment("");
    } catch (error) {
      pushToast({
        variant: "error",
        title: t.collab.commentSyncFailed,
        description: error instanceof Error ? error.message : t.collab.commentSyncFailedDesc,
      });
    } finally {
      setIsSubmittingComment(false);
    }
  }

  const resolvedShareLink =
    typeof window !== "undefined" && shareLink.startsWith("/")
      ? `${window.location.origin}${shareLink}`
      : shareLink;

  const connectionLabel =
    connectionStatus === "connected"
      ? t.collab.realtimeConnected
      : connectionStatus === "reconnecting"
        ? t.collab.realtimeReconnecting
        : connectionStatus === "connecting"
          ? t.collab.realtimeConnecting
          : t.collab.realtimeOffline;

  return (
    <div className="min-h-screen p-6 lg:p-8 max-w-5xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Users className="size-6 text-primary" />
          {t.collab.title}
        </h1>
        <p className="text-sm text-muted mt-1">{t.collab.subtitle}</p>
        <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-cream/70 px-3 py-1 text-xs text-muted">
          <div
            className={`size-2 rounded-full ${
              connectionStatus === "connected"
                ? "bg-tertiary"
                : connectionStatus === "reconnecting"
                  ? "bg-amber-500"
                  : "bg-muted-light"
            }`}
          />
          <span>{connectionLabel}</span>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 flex flex-col gap-6">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-surface rounded-2xl shadow-soft p-6 border border-border-light"
          >
            <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <Link2 className="size-4 text-primary" />
              {t.collab.shareAccess}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted mb-2 block">{t.collab.inviteCode}</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 px-4 py-2.5 bg-cream/50 border border-border rounded-xl font-mono text-sm text-foreground tracking-wider">
                    {inviteCode || "—"}
                  </div>
                  <button
                    type="button"
                    onClick={() => inviteCode && handleCopy(inviteCode, "code")}
                    className="p-2.5 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors cursor-pointer"
                  >
                    {copied === "code" ? <Check className="size-4" /> : <Copy className="size-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs text-muted mb-2 block">{t.collab.shareLink}</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 px-4 py-2.5 bg-cream/50 border border-border rounded-xl text-sm text-muted truncate">
                    {resolvedShareLink || "—"}
                  </div>
                  <button
                    type="button"
                    onClick={() => resolvedShareLink && handleCopy(resolvedShareLink, "link")}
                    className="p-2.5 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors cursor-pointer"
                  >
                    {copied === "link" ? <Check className="size-4" /> : <Copy className="size-4" />}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="bg-surface rounded-2xl shadow-soft p-6 border border-border-light"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <Shield className="size-4 text-lavender" />
                {t.collab.teamMembers}
              </h2>
              <span className="text-xs text-muted bg-border-light px-2 py-0.5 rounded-full">
                {members.length} {t.collab.memberCount}
              </span>
            </div>

            <div className="flex flex-col gap-2">
              {members.map((member, index) => {
                const config = roleConfig[member.role] ?? roleConfig.viewer;
                const RoleIcon = config.icon;
                return (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-cream/40 transition-colors group"
                  >
                    <div className="relative">
                      <div
                        className={cn(
                          "size-10 rounded-full flex items-center justify-center text-white text-sm font-bold",
                          avatarColors[index % avatarColors.length],
                        )}
                      >
                        {member.name[0]}
                      </div>
                      <div
                        className={cn(
                          "absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-surface",
                          member.online ? "bg-tertiary" : "bg-muted-light",
                        )}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{member.name}</p>
                        {member.online && (
                          <span className="text-[10px] text-tertiary flex items-center gap-1">
                            <Wifi className="size-3" />
                            {t.collab.online}
                          </span>
                        )}
                      </div>
                      <div
                        className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium mt-0.5",
                          config.color,
                        )}
                      >
                        <RoleIcon className="size-3" />
                        {config.label}
                      </div>
                    </div>
                  </div>
                );
              })}
              {members.length === 0 && (
                <p className="py-6 text-center text-sm text-muted">{t.collab.noMembersHint}</p>
              )}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-surface rounded-2xl shadow-soft p-6 border border-border-light"
          >
            <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <MousePointer2 className="size-4 text-tertiary" />
              {t.collab.presencePreview}
            </h2>

            <div className="relative h-48 bg-cream/50 rounded-xl border border-border-light overflow-hidden">
              <div className="absolute inset-0 map-grid opacity-50" />

              {[1, 2, 3, 4, 5].map((day) => (
                <div
                  key={day}
                  className="absolute bg-surface/80 border border-border-light rounded-lg px-3 py-1.5 text-xs font-medium text-muted"
                  style={{ left: `${12 + (day - 1) * 18}%`, top: "15%" }}
                >
                  {t.collab.dayBadgePrefix}
                  {day}
                  {t.collab.dayBadgeSuffix}
                </div>
              ))}

              {presence.map((entry) => (
                <motion.div
                  key={entry.userId}
                  animate={{
                    x: [
                      entry.cursorPosition.x,
                      entry.cursorPosition.x + 30,
                      entry.cursorPosition.x - 10,
                    ],
                    y: [
                      entry.cursorPosition.y,
                      entry.cursorPosition.y - 20,
                      entry.cursorPosition.y + 15,
                    ],
                  }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute z-10"
                  style={{ left: 0, top: 0 }}
                >
                  <MousePointer2
                    className="size-4 -rotate-12"
                    style={{ color: entry.color }}
                    fill={entry.color}
                  />
                  <span
                    className="absolute left-4 top-4 px-2 py-0.5 rounded-md text-white text-[10px] font-medium whitespace-nowrap"
                    style={{ backgroundColor: entry.color }}
                  >
                    {entry.userName}
                  </span>
                </motion.div>
              ))}

              {presence.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-muted px-4 text-center">
                  {t.collab.noPresence}
                </div>
              )}

              <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="size-2 rounded-full bg-tertiary animate-pulse" />
                  <span className="text-[10px] text-muted">
                    {session?.user?.name || t.collab.presenceYou}
                    {t.collab.presenceSyncedTail}
                  </span>
                </div>
                <div className="flex -space-x-1.5">
                  {members
                    .filter((member) => member.online)
                    .map((member, index) => (
                      <div
                        key={member.id}
                        className={cn(
                          "size-6 rounded-full border-2 border-surface flex items-center justify-center text-white text-[9px] font-bold",
                          avatarColors[index % avatarColors.length],
                        )}
                      >
                        {member.name[0]}
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        <div className="flex flex-col gap-6">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="bg-surface rounded-2xl shadow-soft p-6 border border-border-light"
          >
            <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <MessageSquare className="size-4 text-secondary" />
              {t.collab.stickyComments}
            </h2>

            <div className="mb-4">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newComment}
                  onChange={(event) => setNewComment(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && void handleAddComment()}
                  placeholder={t.collab.commentPlaceholder}
                  className="flex-1 px-3 py-2 rounded-xl border border-border bg-cream/50 text-sm text-foreground placeholder:text-muted-light focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button
                  type="button"
                  onClick={() => void handleAddComment()}
                  disabled={isSubmittingComment || !roomId}
                  className="p-2 rounded-xl bg-primary text-white cursor-pointer hover:bg-primary-dark transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Plus className="size-4" />
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {comments.map((comment, index) => (
                <motion.div
                  key={comment.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.08 }}
                  className="p-4 rounded-xl border border-border-light relative"
                  style={{ backgroundColor: `${comment.color}20` }}
                >
                  {comment.targetDay && (
                    <span className="absolute -top-2 -right-2 px-2 py-0.5 bg-primary text-white text-[10px] font-bold rounded-full">
                      {t.collab.dayBadgePrefix}
                      {comment.targetDay}
                      {t.collab.dayBadgeSuffix}
                    </span>
                  )}

                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className={cn(
                        "size-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold",
                        avatarColors[index % avatarColors.length],
                      )}
                    >
                      {comment.author[0]}
                    </div>
                    <span className="text-xs font-medium text-foreground">
                      {comment.author}
                    </span>
                    <span className="text-[10px] text-muted ml-auto">
                      {new Date(comment.createdAt).toLocaleString("zh-TW")}
                    </span>
                  </div>

                  <p className="text-sm text-foreground leading-relaxed">
                    {comment.content}
                  </p>
                </motion.div>
              ))}
              {comments.length === 0 && (
                <div className="rounded-xl border border-dashed border-border-light px-4 py-6 text-center text-sm text-muted">
                  {t.collab.noCommentsLong}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
