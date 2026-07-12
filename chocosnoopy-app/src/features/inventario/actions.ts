"use server";

import { revalidatePath } from "next/cache";
import { crearClienteServidor } from "@/lib/supabase/server";
import { materiaPrimaSchema } from "@/lib/validation";
import type { Resultado } from "@/lib/types";

function mensajeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "Ocurrió un error inesperado.";
}

/** Crea o actualiza una materia prima. Calcula el costo unitario. */
export async function guardarMateriaPrima(input: unknown): Promise<Resultado> {
  try {
    const datos = materiaPrimaSchema.parse(input);
    const supabase = crearClienteServidor();

    // Nombre único (mensaje amable antes de que salte el índice único)
    const { data: existentes, error: errBusqueda } = await supabase
      .from("materias_primas")
      .select("id, nombre")
      .ilike("nombre", datos.nombre);
    if (errBusqueda) throw new Error(errBusqueda.message);

    const duplicado = (existentes ?? []).some(
      (m) =>
        m.nombre.trim().toLowerCase() === datos.nombre.toLowerCase() &&
        m.id !== (datos.id ?? -1),
    );
    if (duplicado) {
      return { ok: false, error: "Ya existe una materia prima con ese nombre." };
    }

    const costoUnitario =
      datos.cantidad_presentacion > 0
        ? datos.costo_total_compra / datos.cantidad_presentacion
        : 0;

    const fila = {
      nombre: datos.nombre,
      unidad: datos.unidad,
      cantidad_presentacion: datos.cantidad_presentacion,
      costo_total_compra: datos.costo_total_compra,
      costo_unitario: costoUnitario,
      stock_actual: datos.stock_actual,
      stock_minimo: datos.stock_minimo,
      estado: datos.estado,
      fecha_ingreso: datos.fecha_ingreso || undefined,
    };

    if (datos.id) {
      const { error } = await supabase
        .from("materias_primas")
        .update(fila)
        .eq("id", datos.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("materias_primas").insert(fila);
      if (error) throw new Error(error.message);
    }

    revalidatePath("/inventario");
    revalidatePath("/productos");
    revalidatePath("/");
    return { ok: true, mensaje: "Materia prima guardada correctamente." };
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }
}

/** Alterna el estado Activo/Inactivo de una materia prima. */
export async function cambiarEstadoMateriaPrima(id: number): Promise<Resultado> {
  try {
    const supabase = crearClienteServidor();
    const { data, error } = await supabase
      .from("materias_primas")
      .select("estado")
      .eq("id", id)
      .single();
    if (error) throw new Error(error.message);

    const nuevoEstado = data.estado === "Activo" ? "Inactivo" : "Activo";
    const { error: errUpd } = await supabase
      .from("materias_primas")
      .update({ estado: nuevoEstado })
      .eq("id", id);
    if (errUpd) throw new Error(errUpd.message);

    revalidatePath("/inventario");
    revalidatePath("/productos");
    revalidatePath("/");
    return { ok: true, mensaje: `Materia prima ${nuevoEstado === "Activo" ? "activada" : "desactivada"}.` };
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }
}

/** Ajusta el stock sumando/restando un delta. No permite stock negativo. */
export async function ajustarStock(id: number, delta: number): Promise<Resultado> {
  try {
    const supabase = crearClienteServidor();
    const { data, error } = await supabase
      .from("materias_primas")
      .select("stock_actual, unidad")
      .eq("id", id)
      .single();
    if (error) throw new Error(error.message);

    const nuevo = Number(data.stock_actual) + Number(delta || 0);
    if (nuevo < 0) {
      return { ok: false, error: "El stock no puede quedar negativo." };
    }

    const { error: errUpd } = await supabase
      .from("materias_primas")
      .update({ stock_actual: nuevo })
      .eq("id", id);
    if (errUpd) throw new Error(errUpd.message);

    // Registrar el movimiento manual
    await supabase.from("movimientos_inventario").insert({
      materia_prima_id: id,
      tipo: delta >= 0 ? "Ajuste (+)" : "Ajuste (-)",
      cantidad: delta,
      unidad: data.unidad,
      referencia: "",
      nota: "Ajuste manual de stock",
    });

    revalidatePath("/inventario");
    revalidatePath("/");
    return { ok: true, mensaje: "Stock actualizado correctamente." };
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }
}
