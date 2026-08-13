import { useToastStore } from "@/store/toastStore";
import { Toast, ToastClose, ToastDescription, ToastTitle, ToastProvider, ToastViewport } from "./toast";

export function Toaster() {
  const { toasts, remove } = useToastStore();
  return (
    <ToastProvider>
      {toasts.map((t) => (
        <Toast key={t.id} variant={t.variant} onOpenChange={(open) => !open && remove(t.id)}>
          {t.title && <ToastTitle>{t.title}</ToastTitle>}
          {t.description && <ToastDescription>{t.description}</ToastDescription>}
          <ToastClose />
        </Toast>
      ))}
      <ToastViewport
        className="fixed right-0 top-0 z-[var(--z-toast)] flex max-w-[420px] flex-col gap-2 p-4 sm:bottom-0 sm:top-auto"
        data-floating-obstacle="toast"
      />
    </ToastProvider>
  );
}
