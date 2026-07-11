/**
 * Utilidades de formato (portadas de JS_Utilidades del proyecto original).
 */

/** Formatea un número como moneda colombiana: $12.345 */
export function dinero(valor: number | string | null | undefined): string {
  const n = Number(valor || 0);
  return "$" + n.toLocaleString("es-CO", { maximumFractionDigits: 0 });
}

/** Formatea una cantidad con hasta 2 decimales (para stock, unidades, etc.). */
export function cantidad(valor: number | string | null | undefined): string {
  const n = Number(valor || 0);
  return n.toLocaleString("es-CO", { maximumFractionDigits: 2 });
}

/** Fecha corta legible: 11 jul 2026 */
export function fechaCorta(valor: string | Date | null | undefined): string {
  if (!valor) return "-";
  const fecha = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(fecha.getTime())) return "-";
  return fecha.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Fecha de hoy en formato YYYY-MM-DD (para inputs de tipo date). */
export function hoyISO(): string {
  const hoy = new Date();
  const yyyy = hoy.getFullYear();
  const mm = String(hoy.getMonth() + 1).padStart(2, "0");
  const dd = String(hoy.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
