import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import { normalizarTipoChocolate } from "@/lib/chocolates";
import type { PagoVenta, PropinaVenta, Venta } from "@/lib/types";

export interface ComponenteCajaVenta {
  tipo_chocolate: string;
  tipo_normalizado: string;
  cantidad: number;
}

export interface ProductoVenta {
  id: number;
  nombre: string;
  precio_venta: number;
  tipo_producto: "Individual" | "Compuesto";
  tipo_chocolate: string;
  tipo_normalizado: string;
  componentes: ComponenteCajaVenta[];
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

/** Productos activos vendibles y opciones concretas para llenar cada caja. */
export async function listarProductosVendibles(): Promise<ProductoVenta[]> {
  const supabase = crearClienteServidor();
  const { data, error } = await supabase
    .from("productos")
    .select("id, nombre, precio_venta, tipo_producto, tipo_chocolate, recetas(id)")
    .eq("estado", "Activo")
    .order("nombre", { ascending: true });

  if (error) throw new Error(error.message);

  const { data: componentesData, error: errorComponentes } = await supabase
    .from("productos_componentes_tipos")
    .select("producto_compuesto_id, tipo_chocolate, tipo_normalizado, cantidad");
  if (errorComponentes) throw new Error(errorComponentes.message);

  const componentesPorCaja = new Map<number, ComponenteCajaVenta[]>();
  (componentesData ?? []).forEach((componente) => {
    const lista = componentesPorCaja.get(componente.producto_compuesto_id) ?? [];
    lista.push({
      tipo_chocolate: componente.tipo_chocolate,
      tipo_normalizado: componente.tipo_normalizado,
      cantidad: Number(componente.cantidad),
    });
    componentesPorCaja.set(componente.producto_compuesto_id, lista);
  });

  const productosBase = (data ?? []).map((p: Record<string, unknown>) => ({
      id: p.id as number,
      nombre: p.nombre as string,
      precio_venta: Number(p.precio_venta),
      tipo_producto: p.tipo_producto as ProductoVenta["tipo_producto"],
      tipo_chocolate: (p.tipo_chocolate as string) ?? "",
      tipo_normalizado: normalizarTipoChocolate((p.tipo_chocolate as string) ?? ""),
      componentes: componentesPorCaja.get(p.id as number) ?? [],
      tieneReceta: ((p.recetas as unknown[]) ?? []).length > 0,
    }));

  const tiposConOpciones = new Set(
    productosBase
      .filter((p) => p.tipo_producto === "Individual" && p.tieneReceta)
      .map((p) => p.tipo_normalizado),
  );

  return productosBase
    .filter((p) =>
      p.tipo_producto === "Individual"
        ? p.tieneReceta
        : p.componentes.length > 0 &&
          p.componentes.every((componente) => tiposConOpciones.has(componente.tipo_normalizado)),
    )
    .map(({ tieneReceta: _tieneReceta, ...producto }) => producto);
}
