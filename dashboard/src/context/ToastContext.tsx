import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type ToastTone = "success" | "info" | "error";

export interface ToastOptions {
  message: string;
  tone?: ToastTone;
  /** e.g. { label: "Undo", onClick } — clicking it cancels `onExpire`. */
  action?: { label: string; onClick: () => void };
  /** Runs when the toast times out or is closed (not when its action is clicked). */
  onExpire?: () => void;
  durationMs?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
}

const ToastContext = createContext<((options: ToastOptions) => void) | null>(null);

const DEFAULT_DURATION_MS = 5000;
const ICONS = { success: CheckCircle2, info: Info, error: XCircle };

/** Small confirmations in the corner ("Added to watchlist"), with optional Undo. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const show = useCallback((options: ToastOptions) => {
    const id = nextId.current++;
    setToasts((current) => [...current.slice(-3), { ...options, id }]);
  }, []);

  const finish = useCallback((toast: ToastItem, actionClicked: boolean) => {
    setToasts((current) => current.filter((t) => t.id !== toast.id));
    if (actionClicked) toast.action?.onClick();
    else toast.onExpire?.();
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => (
          <ToastView key={toast.id} toast={toast} onFinish={finish} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastView({ toast, onFinish }: { toast: ToastItem; onFinish: (t: ToastItem, action: boolean) => void }) {
  const tone = toast.tone ?? "success";
  const Icon = ICONS[tone];
  const duration = toast.durationMs ?? DEFAULT_DURATION_MS;
  const done = useRef(false);

  const close = useCallback(
    (actionClicked: boolean) => {
      if (done.current) return;
      done.current = true;
      onFinish(toast, actionClicked);
    },
    [onFinish, toast],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => close(false), duration);
    return () => window.clearTimeout(timer);
  }, [close, duration]);

  return (
    <div className={`toast toast--${tone}`} role={tone === "error" ? "alert" : "status"}>
      <Icon size={18} className="toast__icon" aria-hidden="true" />
      <span className="toast__message">{toast.message}</span>
      {toast.action && (
        <button type="button" className="toast__action" onClick={() => close(true)}>
          {toast.action.label}
        </button>
      )}
      <button type="button" className="toast__close" aria-label="Dismiss" onClick={() => close(false)}>
        <X size={14} />
      </button>
      <span className="toast__timer" style={{ animationDuration: `${duration}ms` }} aria-hidden="true" />
    </div>
  );
}

export function useToast(): (options: ToastOptions) => void {
  const show = useContext(ToastContext);
  if (!show) throw new Error("useToast must be used inside <ToastProvider>");
  return show;
}

/**
 * Delete with Undo: the item disappears at once, and the real delete only runs if
 * the user doesn't click Undo within a few seconds.
 */
export function useUndoableDelete() {
  const toast = useToast();
  return useCallback(
    (options: { message: string; hide: () => void; restore: () => void; commit: () => Promise<unknown> }) => {
      options.hide();
      toast({
        message: options.message,
        tone: "info",
        action: { label: "Undo", onClick: options.restore },
        onExpire: () => {
          options.commit().catch((err: unknown) => {
            options.restore();
            toast({ message: err instanceof Error ? err.message : "Couldn't delete it.", tone: "error" });
          });
        },
      });
    },
    [toast],
  );
}
