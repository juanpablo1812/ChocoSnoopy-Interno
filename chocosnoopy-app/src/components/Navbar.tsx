"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const ENLACES = [
  { href: "/", icono: "home", etiqueta: "Inicio", animacion: "inicio" },
  { href: "/productos", icono: "inventory_2", etiqueta: "Productos", animacion: "productos" },
  { href: "/inventario", icono: "warehouse", etiqueta: "Inventario", animacion: "inventario" },
  { href: "/ventas", icono: "shopping_cart", etiqueta: "Ventas", animacion: "ventas" },
  { href: "/contabilidad", icono: "account_balance_wallet", etiqueta: "Cuentas", animacion: "contabilidad" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [repeticion, setRepeticion] = useState(0);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-accent bg-primary-dark shadow-nav">
      <ul className="mx-auto flex max-w-lg items-stretch justify-around">
        {ENLACES.map((enlace) => {
          const activo =
            enlace.href === "/"
              ? pathname === "/"
              : pathname.startsWith(enlace.href);
          return (
            <li key={enlace.href} className="flex-1">
              <Link
                href={enlace.href}
                onClick={() => setRepeticion((actual) => actual + 1)}
                className={
                  "flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium outline-none transition-colors " +
                  (activo
                    ? "text-secondary"
                    : "text-secondary/75 hover:text-secondary")
                }
              >
                {enlace.animacion === "productos" ? (
                  <svg
                    key={`${enlace.href}-${repeticion}-${activo}`}
                    className={
                      "nav-productos-svg h-[26px] w-[26px] " +
                      (activo
                        ? "nav-productos-svg--activo drop-shadow-[0_0_9px_rgba(255,255,255,1)]"
                        : "opacity-80")
                    }
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path className="nav-productos-tapa" d="M3.5 7.5 12 4l8.5 3.5v3H3.5v-3Z" />
                    <path d="M5 10.5h14v9.5H5zM9 14h6" />
                  </svg>
                ) : (
                  <span
                    key={`${enlace.href}-${repeticion}-${activo}`}
                    className={
                      "material-symbols-outlined nav-icon nav-icon--" + enlace.animacion + " text-[26px] " +
                      (activo
                        ? "nav-icon--activo drop-shadow-[0_0_9px_rgba(255,255,255,1)]"
                        : "opacity-80")
                    }
                  >
                    {enlace.icono}
                  </span>
                )}
                {enlace.etiqueta}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
