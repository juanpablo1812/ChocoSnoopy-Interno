"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Tono = "info" | "success" | "error";
interface ToastItem {
  id: number;
  mensaje: string;
  tono: Tono;
}

interface ToastContextValue {
  mostrar: (mensaje: string, tono?: Tono) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let contador = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const mostrar = useCallback((mensaje: string, tono: Tono = "info") => {
    const id = ++contador;
    setItems((prev) => [...prev, { id, mensaje, tono }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  return (
    <ToastContext.Provider value={{ mostrar }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4">
        {items.map((t) => (
          <div
            key={t.id}
            className={
              "pointer-events-auto max-w-sm rounded-full px-4 py-2 text-sm font-medium text-white shadow-lg " +
              (t.tono === "success"
                ? "bg-green-600"
                : t.tono === "error"
                  ? "bg-rose-600"
                  : "bg-ink")
            }
          >
            {t.mensaje}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast debe usarse dentro de <ToastProvider>.");
  }
  return ctx;
}
