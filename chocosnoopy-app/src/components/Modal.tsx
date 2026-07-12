"use client";

import { type ReactNode, useEffect } from "react";

interface ModalProps {
  abierto: boolean;
  titulo: string;
  onCerrar: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export default function Modal({ abierto, titulo, onCerrar, children, footer }: ModalProps) {
  useEffect(() => {
    if (!abierto) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    document.addEventListener("keydown", onEsc);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onEsc);
      document.body.style.overflow = "";
    };
  }, [abierto, onCerrar]);

  if (!abierto) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-surface sm:rounded-2xl">
        <header className="flex items-center justify-between border-b-2 border-primary px-5 py-4">
          <h2 className="text-lg font-semibold">{titulo}</h2>
          <button
            type="button"
            onClick={onCerrar}
            className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-accent/10 hover:text-accent"
            aria-label="Cerrar"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <footer className="border-t-2 border-primary px-5 py-3">{footer}</footer>
        )}
      </div>
    </div>
  );
}
