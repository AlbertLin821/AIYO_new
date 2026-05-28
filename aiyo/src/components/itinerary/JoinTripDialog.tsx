"use client";

import { memo } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  open: boolean;
  joinCode: string;
  joinLoading: boolean;
  onJoinCodeChange: (value: string) => void;
  onClose: () => void;
  onJoin: () => void;
};

function JoinTripDialog({
  open,
  joinCode,
  joinLoading,
  onJoinCodeChange,
  onClose,
  onJoin,
}: Props) {
  const handleClose = () => {
    if (!joinLoading) {
      onClose();
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          handleClose();
        }
      }}
    >
      <DialogContent
        showCloseButton={!joinLoading}
        className="rounded-2xl border-border-light bg-surface shadow-soft-lg sm:max-w-sm"
      >
        <DialogHeader>
          <DialogTitle className="text-base font-bold">加入別人的行程</DialogTitle>
          <DialogDescription className="text-xs">
            輸入邀請碼或貼上邀請連結來加入他人的共用行程
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="join-trip-code" className="sr-only">
            邀請碼或邀請連結
          </Label>
          <Input
            id="join-trip-code"
            value={joinCode}
            onChange={(event) => onJoinCodeChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && joinCode.trim() && !joinLoading) {
                onJoin();
              }
            }}
            placeholder="邀請碼 或 邀請連結"
            autoFocus
            disabled={joinLoading}
            className="rounded-xl border-border-light bg-cream/30"
          />
        </div>

        <DialogFooter className="gap-2 border-0 bg-transparent p-0 sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            disabled={joinLoading}
            onClick={handleClose}
            className="rounded-xl"
          >
            取消
          </Button>
          <Button
            type="button"
            disabled={!joinCode.trim() || joinLoading}
            onClick={onJoin}
            className="rounded-xl bg-primary font-semibold text-primary-foreground hover:bg-primary-dark"
          >
            {joinLoading ? "加入中..." : "加入"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default memo(JoinTripDialog);
