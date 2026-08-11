"use server";

import { revalidatePath } from "next/cache";
import { crearClienteServidor } from "@/lib/supabase/server";
import { pagosVentaSchema, ventaSchema } from "@/lib/validation";
import type { EstadoVenta, Resultado } from "@/lib/types";

function mensajeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "Ocurrió un error inesperado.";
}

/**
 * Crea una venta completa. La función Postgres `crear_venta` valida stock,
 * descuenta inventario y registra la venta + su detalle de forma transaccional.
 */
export async function crearVenta(input: unknown): Promise<Resultado> {
  try {
    const datos = ventaSchema.parse(input);
    const supabase = crearClienteServidor();

    const { error } = await supabase.rpc("crear_venta_con_propina", {
      payload: {
        cliente: datos.cliente,
        whatsapp: datos.whatsapp,
        fecha_entrega: datos.fecha_entrega,
        estado: datos.estado,
        productos: datos.productos.map((p) => ({
          producto_id: p.producto_id,
          cantidad: p.cantidad,
          selecciones: p.selecciones.map((seleccion) => ({
            producto_id: seleccion.producto_id,
            cantidad: seleccion.cantidad,
          })),
        })),
        pagos: datos.pagos,
        propina: datos.propina,
      },
    });
    if (error) throw new Error(error.message);

    revalidatePath("/ventas");
    revalidatePath("/inventario");
    revalidatePath("/");
    return { ok: true, mensaje: "Venta guardada correctamente." };
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }
}

/** Registra uno o varios abonos para una venta ya creada. */
export async function agregarPagosVenta(ventaId: number, input: unknown): Promise<Resultado> {
  try {
    if (!Number.isInteger(ventaId) || ventaId <= 0) {
      return { ok: false, error: "La venta no es válida." };
    }

    const datos = pagosVentaSchema.parse(input);
    const supabase = crearClienteServidor();
    const { error } = await supabase.rpc("agregar_pagos_y_propina", {
      p_id: ventaId,
      p_pagos: datos.pagos,
      p_propina: datos.propina,
    });
    if (error) throw new Error(error.message);

    revalidatePath("/ventas");
    revalidatePath("/");
    return { ok: true, mensaje: "Pago registrado correctamente." };
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }
}

/**
 * Cambia el estado de una venta. Al cancelar, la función Postgres
 * `cambiar_estado_venta` reintegra el inventario reservado.
 */
export async function cambiarEstadoVenta(id: number, estado: EstadoVenta): Promise<Resultado> {
  try {
    const supabase = crearClienteServidor();
    const { error } = await supabase.rpc("cambiar_estado_venta", {
      p_id: id,
      p_estado: estado,
    });
    if (error) throw new Error(error.message);

    revalidatePath("/ventas");
    revalidatePath("/inventario");
    revalidatePath("/");
    return { ok: true, mensaje: "Estado actualizado." };
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }
}

/**
 * Elimina definitivamente una venta cancelada y todos sus registros asociados.
 * La función Postgres rechaza ventas que todavía no hayan sido canceladas.
 */
export async function eliminarVentaCancelada(id: number): Promise<Resultado> {
  try {
    if (!Number.isInteger(id) || id <= 0) {
      return { ok: false, error: "La venta no es válida." };
    }

    const supabase = crearClienteServidor();
    const { error } = await supabase.rpc("eliminar_venta_cancelada", {
      p_id: id,
    });
    if (error) throw new Error(error.message);

    revalidatePath("/ventas");
    revalidatePath("/inventario");
    revalidatePath("/contabilidad");
    revalidatePath("/");
    return { ok: true, mensaje: "Venta eliminada definitivamente." };
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }
}
