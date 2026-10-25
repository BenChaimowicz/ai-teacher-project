import { Check, CircleAlert, Sparkles } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type ToastTone = "default" | "celebrate" | "error";
type ToastItem = { id: number; title: string; body?: string; tone: ToastTone; leaving: boolean };
type ToastInput = { title: string; body?: string; tone?: ToastTone; durationMs?: number };

const ToastContext = createContext<((toast: ToastInput) => void) | null>(null);

let nextId = 1;

/**
 * Renders toasts top-right. Wrap the app once.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const show = useCallback(({ title, body, tone = "default", durationMs = 3200 }: ToastInput) => {
    const id = nextId++;
    setItems((rows) => [...rows, { id, title, body, tone, leaving: false }]);
    window.setTimeout(() => {
      setItems((rows) => rows.map((row) => (row.id === id ? { ...row, leaving: true } : row)));
      window.setTimeout(() => setItems((rows) => rows.filter((row) => row.id !== id)), 320);
    }, durationMs);
  }, []);

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="k-toasts" aria-live="polite">
        {items.map((item) => {
          const Icon = item.tone === "error" ? CircleAlert : item.tone === "celebrate" ? Sparkles : Check;
          return (
            <div key={item.id} className={`k-toast${item.tone === "error" ? " error" : ""}${item.leaving ? " out" : ""}`}>
              <span className="tic" aria-hidden="true">
                <Icon />
              </span>
              <div>
                <b>{item.title}</b>
                {item.body ? <span>{item.body}</span> : null}
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Returns `toast({ title, body?, tone?, durationMs? })`.
 * @throws If used outside ToastProvider
 */
export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error("[toast.tsx: useToast] Missing ToastProvider");
  return value;
}
