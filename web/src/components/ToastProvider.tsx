import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { friendlyApiError } from '../lib/apiErrors';

export type ToastKind = 'success' | 'error' | 'info' | 'warn';

export type Toast = {
  id: string;
  kind: ToastKind;
  title: string;
  message: string;
};

type ToastApi = {
  push: (kind: ToastKind, title: string, message?: string) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string | unknown) => void;
  info: (title: string, message?: string) => void;
  warn: (title: string, message?: string) => void;
  /** Remplace setError page : toast erreur + message clair. */
  fail: (err: unknown, fallbackTitle?: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

let idSeq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((kind: ToastKind, title: string, message = '') => {
    const id = `t-${Date.now()}-${idSeq++}`;
    setItems((prev) => [...prev.slice(-4), { id, kind, title, message }]);
    window.setTimeout(() => dismiss(id), kind === 'error' ? 8000 : 4500);
  }, [dismiss]);

  const api = useMemo<ToastApi>(
    () => ({
      push,
      success: (title, message) => push('success', title, message),
      error: (title, message) =>
        push('error', title, typeof message === 'string' ? message : undefined),
      info: (title, message) => push('info', title, message),
      warn: (title, message) => push('warn', title, message),
      fail: (err, fallbackTitle = 'Échec') => {
        push('error', fallbackTitle, friendlyApiError(err));
      },
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-relevant="additions">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`} role="status">
            <div className="toast-text">
              <strong>{t.title}</strong>
              {t.message ? <span>{t.message}</span> : null}
            </div>
            <button type="button" className="toast-close" onClick={() => dismiss(t.id)} aria-label="Fermer">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback no-op si hors provider (tests)
    return {
      push: () => undefined,
      success: () => undefined,
      error: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      fail: () => undefined,
    };
  }
  return ctx;
}

/** Écoute les toasts poussés hors React (optionnel). */
export function useToastBridge() {
  const toast = useToast();
  useEffect(() => {
    const onToast = (ev: Event) => {
      const d = (ev as CustomEvent).detail as {
        kind?: ToastKind;
        title?: string;
        message?: string;
      };
      if (d?.title) toast.push(d.kind ?? 'info', d.title, d.message);
    };
    window.addEventListener('pigap-toast', onToast);
    return () => window.removeEventListener('pigap-toast', onToast);
  }, [toast]);
}
