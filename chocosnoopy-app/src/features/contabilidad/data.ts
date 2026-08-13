import "server-only";
import { unstable_noStore as noStore } from "next/cache";
import { crearClienteServidor } from "@/lib/supabase/server";

export type PeriodoContable = "hoy" | "dia" | "semana" | "mes" | "personalizado";

export interface ResumenContable {
  ventas: number;
  dinero: number;
  ingresos_ventas: number;
  propinas: number;
  costos: number;
  utilidad: number;
}

export interface ComparacionContable {
  diferencia: number;
  porcentaje: number | null;
}

export interface PuntoEvolucion {
  etiqueta: string;
  ventas: number;
  dinero: number;
}

export interface ProductoVendido {
  producto_id: number;
  nombre: string;
  unidades: number;
  ventas: number;
  valor_vendido: number;
}

export interface DatosContabilidad {
  periodo: PeriodoContable;
  desde: string;
  hasta: string;
  resumen: ResumenContable;
  comparacion: {
    ventas: ComparacionContable;
    dinero: ComparacionContable;
  };
  evolucion: PuntoEvolucion[];
  productos_vendidos: ProductoVendido[];
}

interface VentaFila {
  id: number;
  fecha_creacion: string;
  detalle_ventas?: DetalleVentaFila[];
}

interface DetalleVentaFila {
  producto_id: number;
  nombre_producto: string;
  cantidad: number;
  subtotal: number;
}

interface MovimientoFila {
  monto: number;
  fecha: string;
  total?: number;
  ganancia?: number;
}

const ZONA = "America/Bogota";
const OFFSET_BOGOTA_MS = 5 * 60 * 60 * 1000;

function fechaBogota(fecha = new Date()): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(fecha);
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${valor("year")}-${valor("month")}-${valor("day")}`;
}

function esFechaISO(valor: string | undefined): valor is string {
  return Boolean(valor && /^\d{4}-\d{2}-\d{2}$/.test(valor) && !Number.isNaN(Date.parse(`${valor}T12:00:00Z`)));
}

function sumarDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Convierte una fecha local de Bogot\u00e1 a su medianoche equivalente en UTC. */
function inicioUTC(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 5)).toISOString();
}

function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000) + 1;
}

function rangoActual(
  periodoSolicitado: string | undefined,
  fechaSolicitada: string | undefined,
  desdeSolicitado: string | undefined,
  hastaSolicitado: string | undefined,
): { periodo: PeriodoContable; desde: string; hasta: string } {
  const hoy = fechaBogota();
  if (periodoSolicitado === "hoy") return { periodo: "hoy", desde: hoy, hasta: hoy };

  if (periodoSolicitado === "dia" && esFechaISO(fechaSolicitada) && fechaSolicitada <= hoy) {
    return { periodo: "dia", desde: fechaSolicitada, hasta: fechaSolicitada };
  }

  if (periodoSolicitado === "semana") {
    const [y, m, d] = hoy.split("-").map(Number);
    const diaSemana = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return { periodo: "semana", desde: sumarDias(hoy, -(diaSemana === 0 ? 6 : diaSemana - 1)), hasta: hoy };
  }

  if (periodoSolicitado === "personalizado" && esFechaISO(desdeSolicitado) && esFechaISO(hastaSolicitado)) {
    const hasta = hastaSolicitado > hoy ? hoy : hastaSolicitado;
    if (desdeSolicitado <= hasta && diasEntre(desdeSolicitado, hasta) <= 366) {
      return { periodo: "personalizado", desde: desdeSolicitado, hasta };
    }
  }

  return { periodo: "mes", desde: `${hoy.slice(0, 7)}-01`, hasta: hoy };
}

function comparar(actual: number, anterior: number): ComparacionContable {
  return {
    diferencia: actual - anterior,
    porcentaje: anterior === 0 ? (actual === 0 ? 0 : null) : ((actual - anterior) / anterior) * 100,
  };
}

function etiquetaDia(fecha: string): string {
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: ZONA })
    .format(new Date(`${fecha}T12:00:00Z`))
    .replace(".", "");
}

export async function obtenerContabilidad(parametros: {
  periodo?: string;
  fecha?: string;
  desde?: string;
  hasta?: string;
}): Promise<DatosContabilidad> {
  noStore();
  const rango = rangoActual(parametros.periodo, parametros.fecha, parametros.desde, parametros.hasta);
  const duracion = diasEntre(rango.desde, rango.hasta);
  const anteriorDesde = sumarDias(rango.desde, -duracion);
  const anteriorHasta = sumarDias(rango.desde, -1);
  const finExclusivo = sumarDias(rango.hasta, 1);
  const anteriorFinExclusivo = rango.desde;
  const supabase = crearClienteServidor();

  const [ventasActuales, ventasAnteriores, pagos, propinas] = await Promise.all([
    supabase.from("ventas").select("id, fecha_creacion, detalle_ventas(producto_id, nombre_producto, cantidad, subtotal)").neq("estado", "Cancelada")
      .gte("fecha_creacion", inicioUTC(rango.desde)).lt("fecha_creacion", inicioUTC(finExclusivo)),
    supabase.from("ventas").select("id").neq("estado", "Cancelada")
      .gte("fecha_creacion", inicioUTC(anteriorDesde)).lt("fecha_creacion", inicioUTC(anteriorFinExclusivo)),
    supabase.from("pagos_ventas").select("monto, fecha, ventas!inner(total, ganancia, estado)")
      .neq("ventas.estado", "Cancelada").gte("fecha", inicioUTC(anteriorDesde)).lt("fecha", inicioUTC(finExclusivo)),
    supabase.from("propinas_ventas").select("monto, fecha, ventas!inner(estado)")
      .neq("ventas.estado", "Cancelada").gte("fecha", inicioUTC(anteriorDesde)).lt("fecha", inicioUTC(finExclusivo)),
  ]);

  for (const resultado of [ventasActuales, ventasAnteriores, pagos, propinas]) {
    if (resultado.error) throw new Error(resultado.error.message);
  }

  const ventasPorDia = new Map<string, number>();
  const productosPorId = new Map<number, ProductoVendido & { ventasIds: Set<number> }>();
  for (const venta of (ventasActuales.data ?? []) as VentaFila[]) {
    const dia = fechaBogota(new Date(venta.fecha_creacion));
    ventasPorDia.set(dia, (ventasPorDia.get(dia) ?? 0) + 1);
    for (const detalle of venta.detalle_ventas ?? []) {
      const productoId = Number(detalle.producto_id);
      const acumulado = productosPorId.get(productoId) ?? {
        producto_id: productoId,
        nombre: detalle.nombre_producto,
        unidades: 0,
        ventas: 0,
        valor_vendido: 0,
        ventasIds: new Set<number>(),
      };
      acumulado.unidades += Number(detalle.cantidad || 0);
      acumulado.valor_vendido += Number(detalle.subtotal || 0);
      acumulado.ventasIds.add(Number(venta.id));
      productosPorId.set(productoId, acumulado);
    }
  }

  const productosVendidos = Array.from(productosPorId.values())
    .map(({ ventasIds, ...producto }) => ({ ...producto, ventas: ventasIds.size }))
    .sort((a, b) => b.unidades - a.unidades || a.nombre.localeCompare(b.nombre, "es"));

  const movimientosActuales: MovimientoFila[] = [];
  const movimientosAnteriores: MovimientoFila[] = [];
  const dineroPorDia = new Map<string, number>();
  let ingresosVentas = 0;
  let propinasActuales = 0;
  let costos = 0;
  let dineroAnterior = 0;

  const agregarMovimiento = (fila: MovimientoFila, esPropina: boolean) => {
    const dia = fechaBogota(new Date(fila.fecha));
    const esActual = dia >= rango.desde && dia <= rango.hasta;
    const destino = esActual ? movimientosActuales : movimientosAnteriores;
    const movimiento = { ...fila, monto: Number(fila.monto || 0) };
    destino.push(movimiento);
    if (!esActual) return;

    dineroPorDia.set(dia, (dineroPorDia.get(dia) ?? 0) + movimiento.monto);
    if (esPropina) {
      propinasActuales += movimiento.monto;
      return;
    }
    ingresosVentas += movimiento.monto;
    const total = Number(movimiento.total || 0);
    const ganancia = Number(movimiento.ganancia || 0);
    costos += total > 0 ? (movimiento.monto / total) * (total - ganancia) : 0;
  };

  for (const pago of pagos.data ?? []) {
    const venta = Array.isArray(pago.ventas) ? pago.ventas[0] : pago.ventas;
    agregarMovimiento({
      monto: Number(pago.monto), fecha: pago.fecha as string,
      total: Number(venta?.total || 0), ganancia: Number(venta?.ganancia || 0),
    }, false);
  }
  for (const propina of propinas.data ?? []) {
    agregarMovimiento({ monto: Number(propina.monto), fecha: propina.fecha as string }, true);
  }

  const dinero = ingresosVentas + propinasActuales;
  for (const movimiento of movimientosAnteriores) dineroAnterior += movimiento.monto;
  const evolucion: PuntoEvolucion[] = Array.from({ length: duracion }, (_, indice) => {
    const dia = sumarDias(rango.desde, indice);
    return { etiqueta: etiquetaDia(dia), ventas: ventasPorDia.get(dia) ?? 0, dinero: dineroPorDia.get(dia) ?? 0 };
  });

  return {
    periodo: rango.periodo,
    desde: rango.desde,
    hasta: rango.hasta,
    resumen: {
      ventas: (ventasActuales.data ?? []).length,
      dinero,
      ingresos_ventas: ingresosVentas,
      propinas: propinasActuales,
      costos,
      utilidad: dinero - costos,
    },
    comparacion: {
      ventas: comparar((ventasActuales.data ?? []).length, (ventasAnteriores.data ?? []).length),
      dinero: comparar(dinero, dineroAnterior),
    },
    evolucion,
    productos_vendidos: productosVendidos,
  };
}
