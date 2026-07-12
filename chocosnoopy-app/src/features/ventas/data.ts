import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { PagoVenta, PropinaVenta, Venta } from "@/lib/types";

export interface ProductoVenta {
  id: number;
  nombre: string;
  precio_venta: number;
  tipo_producto: "Individual" | "Compuesto";
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

/** Productos activos vendibles: chocolates con receta y cajas con componentes. */
export async function listarProductosVendibles(): Promise<ProductoVenta[]> {
  const supabase = crearClienteServidor();
  const { data, error } = await supabase
    .from("productos")
    .select("id, nombre, precio_venta, tipo_producto, recetas(id), productos_componentes!productos_componentes_producto_compuesto_id_fkey(id)")
    .eq("estado", "Activo")
    .order("nombre", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? [])
    .filter((p: Record<string, unknown>) =>
      p.tipo_producto === "Compuesto"
        ? ((p.productos_componentes as unknown[]) ?? []).length > 0
        : ((p.recetas as unknown[]) ?? []).length > 0,
    )
    .map((p: Record<string, unknown>) => ({
      id: p.id as number,
      nombre: p.nombre as string,
      precio_venta: Number(p.precio_venta),
      tipo_producto: p.tipo_producto as ProductoVenta["tipo_producto"],
    }));
}
