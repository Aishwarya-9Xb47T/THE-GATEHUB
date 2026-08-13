import { create } from "zustand";

export type ToastVariant = "default" | "destructive" | "success";

interface ToastItem {
  id: string;
  title?: string;
  description?: string;
  variant?: ToastVariant;
}

interface ToastState {
  toasts: ToastItem[];
  add: (t: Omit<ToastItem, "id">) => void;
  remove: (id: string) => void;
}

let id = 0;
export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  add: (t) => {
    const idStr = String(++id);
    set((s) => ({ toasts: [...s.toasts, { ...t, id: idStr }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== idStr) })), 5000);
  },
  remove: (idStr) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== idStr) })),
}));
