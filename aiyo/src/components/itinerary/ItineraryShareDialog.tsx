"use client";

import { memo } from "react";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { zhTW as t } from "@/locales/zh-TW";
import type { TripCollaboratorDto } from "@/services/itineraryClient";
import { roleLabel } from "./itineraryUi";

type Props = {
  open: boolean;
  inviteCode: string;
  shareLink: string;
  collaborators: TripCollaboratorDto[];
  canManageShare: boolean;
  collabEmail: string;
  collabRole: "editor" | "viewer";
  collabError: string | null;
  onClose: () => void;
  onCollabEmailChange: (value: string) => void;
  onCollabRoleChange: (value: "editor" | "viewer") => void;
  onAddCollaborator: () => void;
  onUpdateRole: (tripId: string, userId: string, role: "editor" | "viewer") => void;
  onRemoveCollaborator: (tripId: string, userId: string) => void;
};

function ItineraryShareDialog({
  open,
  inviteCode,
  shareLink,
  collaborators,
  canManageShare,
  collabEmail,
  collabRole,
  collabError,
  onClose,
  onCollabEmailChange,
  onCollabRoleChange,
  onAddCollaborator,
  onUpdateRole,
  onRemoveCollaborator,
}: Props) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      <DialogContent
        data-testid="share-collaboration-dialog"
        className="max-h-[85vh] overflow-y-auto rounded-2xl border-border-light bg-surface shadow-soft-lg sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Users className="size-4 text-primary" />
            {t.itineraryPage.shareDialogTitle}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs text-muted">{t.itineraryPage.shareLinkLabel}</p>
            <div className="rounded-xl border border-border bg-cream/40 px-3 py-2 text-xs text-muted">
              {shareLink || (inviteCode ? `/itinerary?invite=${inviteCode}` : t.itineraryPage.noShareLink)}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs text-muted">{t.itineraryPage.inviteCodeLabel}</p>
            <div className="rounded-xl border border-border bg-cream/40 px-3 py-2 font-mono text-sm">
              {inviteCode || t.itineraryPage.noInviteCode}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs text-muted">{t.itineraryPage.collaboratorsLabel}</p>
            <div className="space-y-2">
              {collaborators.length ? (
                collaborators.map((member) => (
                  <div
                    key={member.userId}
                    className="flex items-center justify-between gap-3 rounded-xl bg-primary/5 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-foreground">
                        {member.user.name || member.user.email}
                      </p>
                      <p className="truncate text-[11px] text-muted">{member.user.email}</p>
                    </div>
                    {canManageShare && member.role !== "owner" ? (
                      <div className="flex items-center gap-2">
                        <select
                          value={member.role}
                          onChange={(event) =>
                            onUpdateRole(
                              member.tripId,
                              member.userId,
                              event.target.value as "editor" | "viewer",
                            )
                          }
                          className="rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                        >
                          <option value="editor">{t.itineraryPage.roleEditor}</option>
                          <option value="viewer">{t.itineraryPage.roleViewer}</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => onRemoveCollaborator(member.tripId, member.userId)}
                          className="text-xs text-danger"
                        >
                          {t.itineraryPage.removeCollaborator}
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted">{roleLabel(member.role)}</span>
                    )}
                  </div>
                ))
              ) : (
                <p className="rounded-xl border border-dashed border-border-light px-3 py-4 text-center text-sm text-muted">
                  {t.itineraryPage.noCollaborators}
                </p>
              )}
            </div>
          </div>
          {canManageShare && (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-muted">{t.itineraryPage.inviteUser}</p>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                <Input
                  value={collabEmail}
                  onChange={(event) => onCollabEmailChange(event.target.value)}
                  placeholder={t.itineraryPage.inviteEmailPh}
                  className="rounded-lg border-border bg-surface text-xs"
                />
                <select
                  value={collabRole}
                  onChange={(event) => onCollabRoleChange(event.target.value as "editor" | "viewer")}
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-xs"
                >
                  <option value="editor">{t.itineraryPage.roleEditor}</option>
                  <option value="viewer">{t.itineraryPage.roleViewer}</option>
                </select>
                <Button
                  type="button"
                  onClick={onAddCollaborator}
                  disabled={!collabEmail.trim()}
                  className="rounded-lg bg-primary text-xs text-primary-foreground hover:bg-primary-dark"
                >
                  {t.itineraryPage.invite}
                </Button>
              </div>
              {collabError && <p className="mt-2 text-xs text-danger">{collabError}</p>}
            </div>
          )}
          <div className="rounded-xl bg-cream/40 px-3 py-3 text-xs text-muted">
            {canManageShare ? t.itineraryPage.shareOwnerHint : t.itineraryPage.shareLimitedHint}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default memo(ItineraryShareDialog);
