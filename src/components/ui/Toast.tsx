import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: string;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  show: (kind: ToastKind, message: string) => void;
  success: (message: string) => void;
  error: (err: unknown) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const STYLES: Record<ToastKind, { bg: string; icon: React.ElementType }> = {
  success: { bg: 'bg-emerald-600', icon: CheckCircle2 },
  error: { bg: 'bg-red-600', icon: XCircle },
  info: { bg: 'bg-slate-800', icon: Info },
  warning: { bg: 'bg-amber-600', icon: AlertTriangle }
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<ToastItem[]>([]);

  const remove = useCallback((id: string) => setItems((prev) => prev.filter((t) => t.id !== id)), []);

  const show = useCallback(
    (kind: ToastKind, message: string) => {
      const id = Math.random().toString(36).slice(2);
      setItems((prev) => [...prev, { id, kind, message }]);
      setTimeout(() => remove(id), kind === 'error' ? 7000 : 4000);
    },
    [remove]
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (m) => show('success', m),
      info: (m) => show('info', m),
      warning: (m) => show('warning', m),
      error: (err) => show('error', err instanceof Error ? err.message : String(err ?? 'უცნობი შეცდომა'))
    }),
    [show]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 no-print">
        {items.map((t) => {
          const { bg, icon: Icon } = STYLES[t.kind];
          return (
            <div
              key={t.id}
              className={`${bg} text-white rounded-xl shadow-lg px-4 py-3 text-sm font-semibold flex items-start gap-3 max-w-md animate-[fadeIn_.15s_ease-out]`}
            >
              <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span className="flex-1 whitespace-pre-line">{t.message}</span>
              <button onClick={() => remove(t.id)} className="opacity-70 hover:opacity-100 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast უნდა გამოიყენოთ ToastProvider-ის შიგნით');
  return ctx;
}
