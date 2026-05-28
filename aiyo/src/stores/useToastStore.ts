import { create } from "zustand";
import { toast as sonnerToast } from "sonner";

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant?: "info" | "success" | "error" | "warning";
  actionLabel?: string;
  action?: () => void;
}

interface ToastState {
  toasts: ToastItem[];
  pushToast: (toast: Omit<ToastItem, "id">) => void;
  dismissToast: (id: string) => void;
}

export const useToastStore = create<ToastState>(() => ({
  toasts: [],
  pushToast: (toast) => {
    const id = `toast_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    const options = {
      id,
      description: toast.description,
      duration: 4500,
      action:
        toast.actionLabel && toast.action
          ? { label: toast.actionLabel, onClick: toast.action }
          : undefined,
    };

    switch (toast.variant) {
      case "success":
        sonnerToast.success(toast.title, options);
        break;
      case "error":
        sonnerToast.error(toast.title, options);
        break;
      case "warning":
        sonnerToast.warning(toast.title, options);
        break;
      default:
        sonnerToast(toast.title, options);
    }
  },
  dismissToast: (id) => {
    sonnerToast.dismiss(id);
  },
}));
