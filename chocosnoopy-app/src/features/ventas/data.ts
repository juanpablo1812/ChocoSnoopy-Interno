import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { PagoVenta, PropinaVenta, Venta } from "@/lib/types";

export interface ProductoVenta {
  id: number;
  nombre: string;
  precio_venta: number;
}

/** Lista las ventas ordenadas de la más reciente a la más antigua. */
export async function listarVentas(): Promise<Venta[]> {
  const supabase = crearClienteServidor();
  const { data, error } = await supabase
    .from("ventas")
    .select("*, pagos_ventas(*), propinas_ventas(*)")
    .order("fecha_creacion", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map((venta) => {
    const { pagos_ventas, propinas_ventas, ...datosVenta } = venta as Venta & {
      pagos_ventas?: PagoVenta[];
      propinas_ventas?: PropinaVenta[];
    };
    return {
      ...datosVenta,
      pagos: [...(pagos_ventas ?? [])].sort((a, b) => a.numero - b.numero),
      propinas: [...(propinas_ventas ?? [])],
    };
  });
}

/** Productos activos disponibles para vender (los que tienen receta). */
export async function listarProductosVendibles(): Promise<ProductoVenta[]> {
  const supabase = crearClienteServidor();
  const { data, error } = await supabase
    .from("productos")
    .select("id, nombre, precio_venta, recetas(id)")
    .eq("estado", "Activo")
    .order("nombre", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? [])
    .filter((p: Record<string, unknown>) => ((p.recetas as unknown[]) ?? []).length > 0)
    .map((p: Record<string, unknown>) => ({
      id: p.id as number,
      nombre: p.nombre as string,
      precio_venta: Number(p.precio_venta),
    }));
}
