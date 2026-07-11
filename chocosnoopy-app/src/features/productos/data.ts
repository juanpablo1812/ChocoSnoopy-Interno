import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { Producto } from "@/lib/types";

interface RecetaRow {
  id: number;
  materia_prima_id: number;
  cantidad: number;
  materias_primas: {
    nombre: string;
    unidad: string;
    costo_unitario: number;
  } | null;
}

/** Lista todos los productos con su receta detallada. */
export async function listarProductos(): Promise<Producto[]> {
  const supabase = crearClienteServidor();
  const { data, error } = await supabase
    .from("productos")
    .select(
      "*, recetas(id, materia_prima_id, cantidad, materias_primas(nombre, unidad, costo_unitario))",
    )
    .order("nombre", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((p: Record<string, unknown>) => {
    const recetasRaw = (p.recetas as RecetaRow[]) ?? [];
    const recetas = recetasRaw
      .map((r) => {
        const costoUnitario = Number(r.materias_primas?.costo_unitario ?? 0);
        return {
          id: r.id,
          materia_prima_id: r.materia_prima_id,
          nombre_materia_prima: r.materias_primas?.nombre ?? "",
          unidad: r.materias_primas?.unidad ?? "",
          cantidad: Number(r.cantidad),
          costo_unitario: costoUnitario,
          costo_total: costoUnitario * Number(r.cantidad),
        };
      })
      .sort((a, b) => a.nombre_materia_prima.localeCompare(b.nombre_materia_prima, "es"));

    return {
      id: p.id as number,
      nombre: p.nombre as string,
      categoria: (p.categoria as string) ?? "",
      precio_venta: Number(p.precio_venta),
      costo_produccion: Number(p.costo_produccion),
      ganancia: Number(p.ganancia),
      estado: p.estado as Producto["estado"],
      created_at: p.created_at as string,
      updated_at: p.updated_at as string,
      recetas,
    };
  });
}
