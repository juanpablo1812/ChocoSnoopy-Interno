/** Compara tipos ignorando mayúsculas y cualquier espacio. */
export function normalizarTipoChocolate(valor: string): string {
  return valor.trim().toLocaleLowerCase("es").replace(/\s+/g, "");
}
