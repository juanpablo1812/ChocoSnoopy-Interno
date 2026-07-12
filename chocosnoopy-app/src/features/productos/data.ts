import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { ComponenteProducto, Producto } from "@/lib/types";

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

interface ComponenteRow {
  id: number;
  producto_componente_id: number;
  cantidad: number;
  productos: { nombre: string; costo_produccion: number } | null;
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

  const { data: componentesData, error: componentesError } = await supabase
    .from("productos_componentes")
    .select("id, producto_compuesto_id, producto_componente_id, cantidad, productos!productos_componentes_producto_componente_id_fkey(nombre, costo_produccion)");
  if (componentesError) throw new Error(componentesError.message);

  const componentesPorCaja = new Map<number, ComponenteProducto[]>();
  ((componentesData ?? []) as unknown as (ComponenteRow & { producto_compuesto_id: number })[]).forEach((c) => {
    const lista = componentesPorCaja.get(c.producto_compuesto_id) ?? [];
    lista.push({
      id: c.id,
      producto_id: c.producto_componente_id,
      nombre_producto: c.productos?.nombre ?? "",
      cantidad: Number(c.cantidad),
      costo_unitario: Number(c.productos?.costo_produccion ?? 0),
      costo_total: Number(c.cantidad) * Number(c.productos?.costo_produccion ?? 0),
    });
    componentesPorCaja.set(c.producto_compuesto_id, lista);
  });

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
      tipo_producto: (p.tipo_producto as Producto["tipo_producto"]) ?? "Individual",
      precio_venta: Number(p.precio_venta),
      costo_produccion: Number(p.costo_produccion),
      ganancia: Number(p.ganancia),
      estado: p.estado as Producto["estado"],
      created_at: p.created_at as string,
      updated_at: p.updated_at as string,
      recetas,
      componentes: (componentesPorCaja.get(p.id as number) ?? []).sort((a, b) =>
        (a.nombre_producto ?? "").localeCompare(b.nombre_producto ?? "", "es"),
      ),
    };
  });
}
