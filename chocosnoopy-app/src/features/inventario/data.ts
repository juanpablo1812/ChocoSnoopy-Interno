import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { MateriaPrima, MateriaPrimaConAlerta } from "@/lib/types";

/** Lista todas las materias primas con la marca de stock bajo mínimo. */
export async function listarMateriasPrimas(): Promise<MateriaPrimaConAlerta[]> {
  const supabase = crearClienteServidor();
  const { data, error } = await supabase
    .from("materias_primas")
    .select("*")
    .order("nombre", { ascending: true });

  if (error) throw new Error(error.message);

  return (data as MateriaPrima[]).map((m) => ({
    ...m,
    bajo_minimo: m.estado === "Activo" && Number(m.stock_actual) <= Number(m.stock_minimo),
  }));
}

/** Materias primas activas (para selectores de recetas). */
export async function listarMateriasPrimasActivas(): Promise<MateriaPrima[]> {
  const supabase = crearClienteServidor();
  const { data, error } = await supabase
    .from("materias_primas")
    .select("*")
    .eq("estado", "Activo")
    .order("nombre", { ascending: true });

  if (error) throw new Error(error.message);
  return data as MateriaPrima[];
}
