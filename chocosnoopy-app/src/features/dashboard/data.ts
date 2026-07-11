import "server-only";
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

function resumir(ventas: { total: number; ganancia: number }[]): ResumenVentas {
  return {
    ventas: ventas.length,
    ingresos: ventas.reduce((t, v) => t + Number(v.total || 0), 0),
    ganancia: ventas.reduce((t, v) => t + Number(v.ganancia || 0), 0),
  };
}

export async function obtenerDashboard(): Promise<DashboardData> {
  const supabase = crearClienteServidor();
  const limites = limitesBogota();
  const desde = Math.min(limites.semana, limites.mes);

  // Ventas del periodo (excluye canceladas: no representan ingreso ni utilidad).
  const { data: ventas, error } = await supabase
    .from("ventas")
    .select("fecha_creacion, total, ganancia, estado")
    .neq("estado", "Cancelada")
    .gte("fecha_creacion", new Date(desde).toISOString());
  if (error) throw new Error(error.message);

  const filas = (ventas ?? []).map((v) => ({
    ms: Date.parse(v.fecha_creacion as string),
    total: Number(v.total),
    ganancia: Number(v.ganancia),
  }));

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
