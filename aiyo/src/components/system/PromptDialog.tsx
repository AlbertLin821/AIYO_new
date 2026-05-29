"use client";

import { memo } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  open: boolean;
  title: string;
  label: string;
  value: string;
  placeholder?: string;
  confirmLabel: string;
  cancelLabel: string;
  pending?: boolean;
  onValueChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

function PromptDialog({
  open,
  title,
  label,
  value,
  placeholder,
  confirmLabel,
  cancelLabel,
  pending = false,
  onValueChange,
  onCancel,
  onConfirm,
}: Props) {
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
        <DialogHeader className="pr-10">
          <DialogTitle id="site-prompt-heading" className="font-semibold">
            {title}
          </DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            onConfirm();
          }}
        >
          <div>
            <Label htmlFor="site-prompt-input" className="mb-2 block text-xs text-muted">
              {label}
            </Label>
            <Input
              id="site-prompt-input"
              value={value}
              onChange={(event) => onValueChange(event.target.value)}
              placeholder={placeholder}
              disabled={pending}
              autoComplete="off"
              autoFocus
              className="rounded-xl border-border-light bg-cream/40"
            />
          </div>
          <DialogFooter className="flex flex-col-reverse gap-2 border-0 bg-transparent p-0 sm:flex-row sm:flex-wrap sm:justify-end">
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
              type="submit"
              disabled={pending || !value.trim()}
              className="w-full min-w-0 rounded-xl bg-primary text-primary-foreground hover:bg-primary-dark sm:w-auto"
            >
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default memo(PromptDialog);
