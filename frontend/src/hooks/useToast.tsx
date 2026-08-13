import { useCallback, useState } from "react";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";

type ToastVariant = "default" | "destructive" | "success";

interface ToastState {
  id: string;
  title?: string;
  description?: string;
  variant?: ToastVariant;
}

let toastCount = 0;
export function useToast() {
  const [toasts, setToasts] = useState<ToastState[]>([]);

  const toast = useCallback(({ title, description, variant = "default" }: { title?: string; description?: string; variant?: ToastVariant }) => {
    const id = String(++toastCount);
    setToasts((prev) => [...prev, { id, title, description, variant }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);

  const dismiss = useCallback((id: string) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

  const Toaster = useCallback(
    () => (
      <ToastProvider>
        {toasts.map((t) => (
          <Toast key={t.id} variant={t.variant} onOpenChange={(open) => !open && dismiss(t.id)}>
            {t.title && <ToastTitle>{t.title}</ToastTitle>}
            {t.description && <ToastDescription>{t.description}</ToastDescription>}
            <ToastClose />
          </Toast>
        ))}
        <ToastViewport />
      </ToastProvider>
    ),
    [toasts, dismiss]
  );

  return { toast, Toaster };
}
