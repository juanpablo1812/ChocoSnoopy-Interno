"use server";

import { revalidatePath } from "next/cache";
import { crearClienteServidor } from "@/lib/supabase/server";
import { productoSchema } from "@/lib/validation";
import type { Resultado } from "@/lib/types";

function mensajeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "Ocurrió un error inesperado.";
}

/**
 * Crea o actualiza un producto con su receta. La función Postgres
 * `guardar_producto` calcula el costo de producción y la ganancia, valida
 * nombre único y persiste producto + recetas de forma transaccional.
 */
export async function guardarProducto(input: unknown): Promise<Resultado> {
  try {
    const datos = productoSchema.parse(input);
    const supabase = crearClienteServidor();

    const { error } = await supabase.rpc("guardar_producto", {
      payload: {
        id: datos.id ?? null,
        nombre: datos.nombre,
        categoria: datos.categoria,
        precio_venta: datos.precio_venta,
        estado: datos.estado,
        recetas: datos.recetas.map((r) => ({
          materia_prima_id: r.materia_prima_id,
          cantidad: r.cantidad,
        })),
      },
    });
    if (error) throw new Error(error.message);

    revalidatePath("/productos");
    revalidatePath("/ventas");
    return { ok: true, mensaje: "Producto guardado correctamente." };
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }
}

/** Alterna el estado Activo/Inactivo de un producto. */
export async function cambiarEstadoProducto(id: number): Promise<Resultado> {
  try {
    const supabase = crearClienteServidor();
    const { data, error } = await supabase
      .from("productos")
      .select("estado")
      .eq("id", id)
      .single();
    if (error) throw new Error(error.message);

    const nuevoEstado = data.estado === "Activo" ? "Inactivo" : "Activo";
    const { error: errUpd } = await supabase
      .from("productos")
      .update({ estado: nuevoEstado })
      .eq("id", id);
    if (errUpd) throw new Error(errUpd.message);

    revalidatePath("/productos");
    revalidatePath("/ventas");
    return { ok: true, mensaje: `Producto ${nuevoEstado === "Activo" ? "activado" : "desactivado"}.` };
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }
}

/** Duplica un producto (nombre "(Copia)") reutilizando su receta. */
export async function duplicarProducto(id: number): Promise<Resultado> {
  try {
    const supabase = crearClienteServidor();
    const { data, error } = await supabase
      .from("productos")
      .select("nombre, categoria, precio_venta, recetas(materia_prima_id, cantidad)")
      .eq("id", id)
      .single();
    if (error) throw new Error(error.message);

    // Nombre único
    const { data: todos } = await supabase.from("productos").select("nombre");
    const nombres = new Set((todos ?? []).map((p) => p.nombre.trim().toLowerCase()));
    const base = data.nombre;
    let candidato = `${base} (Copia)`;
    let n = 2;
    while (nombres.has(candidato.toLowerCase())) {
      candidato = `${base} (Copia ${n})`;
      n++;
    }

    const recetas = (data.recetas as { materia_prima_id: number; cantidad: number }[]) ?? [];
    const { error: errRpc } = await supabase.rpc("guardar_producto", {
      payload: {
        id: null,
        nombre: candidato,
        categoria: data.categoria ?? "",
        precio_venta: data.precio_venta,
        estado: "Activo",
        recetas: recetas.map((r) => ({
          materia_prima_id: r.materia_prima_id,
          cantidad: r.cantidad,
        })),
      },
    });
    if (errRpc) throw new Error(errRpc.message);

    revalidatePath("/productos");
    return { ok: true, mensaje: "Producto duplicado correctamente." };
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }
}
