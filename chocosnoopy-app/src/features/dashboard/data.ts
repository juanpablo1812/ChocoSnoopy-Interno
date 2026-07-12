import "server-only";
import { unstable_noStore as noStore } from "next/cache";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { AlertaInventario, DashboardData, ResumenVentas } from "@/lib/types";

const TZ_OFFSET_HORAS = 5; // Colombia = UTC-5 (sin horario de verano)

/**
 * Calcula los instantes UTC que corresponden a la medianoche de Bogotá para
 * hoy, el inicio de la semana (lunes) y el inicio del mes. Así los resúmenes
 * se agrupan por el día real del negocio y no por el día UTC del servidor.
 */
function limitesBogota(): { hoy: number; semana: number; mes: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [y, m, d] = fmt.format(new Date()).split("-").map(Number);

  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=domingo
  const diffLunes = dow === 0 ? 6 : dow - 1;

  const H = TZ_OFFSET_HORAS;
  return {
    hoy: Date.UTC(y, m - 1, d, H),
    semana: Date.UTC(y, m - 1, d - diffLunes, H),
    mes: Date.UTC(y, m - 1, 1, H),
  };
}

interface IngresoConVenta {
  monto: number;
  fecha: string;
  ganancia: number;
  esPago: boolean;
}

interface IngresoConFecha extends IngresoConVenta {
  ms: number;
}

function resumir(ingresos: IngresoConVenta[]): ResumenVentas {
  return {
    pagos: ingresos.filter((ingreso) => ingreso.esPago).length,
    ingresos: ingresos.reduce((t, ingreso) => t + Number(ingreso.monto || 0), 0),
    ganancia: ingresos.reduce((t, ingreso) => t + Number(ingreso.ganancia || 0), 0),
  };
}

export async function obtenerDashboard(): Promise<DashboardData> {
  // El inventario debe reflejar los valores actuales en cada visita a Inicio.
  noStore();

  const supabase = crearClienteServidor();
  const limites = limitesBogota();
  const desde = Math.min(limites.semana, limites.mes);

  // Dinero realmente recibido en el periodo. Los pagos de ventas canceladas
  // no cuentan como ingreso ni utilidad.
  const [{ data: pagos, error: errorPagos }, { data: propinas, error: errorPropinas }] = await Promise.all([
    supabase
      .from("pagos_ventas")
      .select("monto, fecha, ventas!inner(total, ganancia, estado)")
      .neq("ventas.estado", "Cancelada")
      .gte("fecha", new Date(desde).toISOString()),
    supabase
      .from("propinas_ventas")
      .select("monto, fecha, ventas!inner(estado)")
      .neq("ventas.estado", "Cancelada")
      .gte("fecha", new Date(desde).toISOString()),
  ]);
  if (errorPagos) throw new Error(errorPagos.message);
  if (errorPropinas) throw new Error(errorPropinas.message);

  const filasPagos: IngresoConFecha[] = (pagos ?? []).map((p) => {
    const venta = Array.isArray(p.ventas) ? p.ventas[0] : p.ventas;
    return {
      monto: Number(p.monto),
      fecha: p.fecha as string,
      ganancia:
        venta && Number(venta.total) > 0
          ? (Number(p.monto) / Number(venta.total)) * Number(venta.ganancia || 0)
          : 0,
      esPago: true,
      ms: Date.parse(p.fecha as string),
    };
  });

  const filasPropinas: IngresoConFecha[] = (propinas ?? []).map((propina) => ({
    monto: Number(propina.monto),
    fecha: propina.fecha as string,
    ganancia: Number(propina.monto),
    esPago: false,
    ms: Date.parse(propina.fecha as string),
  }));

  const filas = [...filasPagos, ...filasPropinas];

  const hoy = resumir(filas.filter((f) => f.ms >= limites.hoy));
  const semana = resumir(filas.filter((f) => f.ms >= limites.semana));
  const mes = resumir(filas.filter((f) => f.ms >= limites.mes));

  // Alertas de inventario (materias activas por debajo o al nivel mínimo).
  const { data: materias, error: errMat } = await supabase
    .from("materias_primas")
    .select("nombre, stock_actual, stock_minimo, unidad, estado")
    .eq("estado", "Activo")
    .order("nombre", { ascending: true });
  if (errMat) throw new Error(errMat.message);

  const alertas: AlertaInventario[] = (materias ?? [])
    .filter((m) => Number(m.stock_actual) <= Number(m.stock_minimo))
    .map((m) => ({
      nombre: m.nombre as string,
      stock: Number(m.stock_actual),
      unidad: m.unidad as string,
    }));

  return { hoy, semana, mes, alertas };
}
