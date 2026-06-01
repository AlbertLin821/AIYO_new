"use client";

import { memo } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  pending?: boolean;
  pendingLabel?: string;
  variant?: "danger" | "primary";
  onCancel: () => void;
  onConfirm: () => void;
};

function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  pending = false,
  pendingLabel,
  variant = "primary",
  onCancel,
  onConfirm,
}: Props) {
  const isDanger = variant === "danger";

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !pending) {
          onCancel();
        }
      }}
    >
      <DialogContent
        showCloseButton={!pending}
        className="overflow-hidden rounded-2xl border-border-light bg-surface p-5 shadow-soft-lg sm:max-w-md"
      >
        <DialogHeader className="gap-3 pr-10">
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-full",
                isDanger ? "bg-danger/10 text-danger" : "bg-primary/10 text-primary",
              )}
            >
              <AlertTriangle className="size-5" aria-hidden />
            </span>
            <div className="flex flex-col gap-1.5 pt-0.5">
              <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
              <DialogDescription className="leading-6">{description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <DialogFooter className="mt-2 flex flex-col-reverse gap-2 border-0 bg-transparent p-0 sm:flex-row sm:flex-wrap sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onCancel}
            className="w-full min-w-0 rounded-xl border-border-light sm:w-auto"
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            disabled={pending}
            onClick={onConfirm}
            className={cn(
              "w-full min-w-0 rounded-xl sm:w-auto",
              isDanger
                ? "bg-danger text-white hover:bg-danger/90"
                : "bg-primary text-primary-foreground hover:bg-primary-dark",
            )}
          >
            {pending ? pendingLabel || confirmLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default memo(ConfirmDialog);
