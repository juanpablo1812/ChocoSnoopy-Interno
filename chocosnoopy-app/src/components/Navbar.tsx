"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ENLACES = [
  { href: "/", icono: "home", etiqueta: "Inicio" },
  { href: "/productos", icono: "inventory_2", etiqueta: "Productos" },
  { href: "/inventario", icono: "warehouse", etiqueta: "Inventario" },
  { href: "/ventas", icono: "shopping_cart", etiqueta: "Ventas" },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-black/5 bg-surface shadow-nav">
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
                className={
                  "flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors " +
                  (activo ? "text-accent" : "text-muted hover:text-ink")
                }
              >
                <span
                  className={
                    "material-symbols-outlined text-[26px] " +
                    (activo ? "" : "opacity-80")
                  }
                >
                  {enlace.icono}
                </span>
                {enlace.etiqueta}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
