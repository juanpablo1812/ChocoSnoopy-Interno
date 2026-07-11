import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { obtenerDashboard } from "@/features/dashboard/data";
import { dinero, cantidad } from "@/lib/format";
import type { ResumenVentas } from "@/lib/types";

export const dynamic = "force-dynamic";

function Resumen({ titulo, datos }: { titulo: string; datos: ResumenVentas }) {
  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-muted">{titulo}</h3>
      <div className="mt-2 flex items-end justify-between">
        <div>
          <div className="text-2xl font-bold">{dinero(datos.ingresos)}</div>
          <div className="text-xs text-muted">{datos.ventas} ventas</div>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold text-green-600">{dinero(datos.ganancia)}</div>
          <div className="text-xs text-muted">ganancia</div>
        </div>
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const data = await obtenerDashboard();

  return (
    <>
      <PageHeader titulo="Chocosnoopy" subtitulo="Panel de control" />

      <section className="flex flex-col gap-3">
        <Resumen titulo="Hoy" datos={data.hoy} />
        <div className="grid grid-cols-2 gap-3">
          <Resumen titulo="Esta semana" datos={data.semana} />
          <Resumen titulo="Este mes" datos={data.mes} />
        </div>
      </section>

      <section className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Alertas de inventario</h2>
          <Link href="/inventario" className="text-sm text-accent">
            Ver inventario
          </Link>
        </div>

        {data.alertas.length === 0 ? (
          <div className="rounded-xl2 bg-surface p-4 text-sm text-muted shadow-card">
            Todo el inventario está por encima del mínimo. 🎉
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {data.alertas.map((a) => (
              <div
                key={a.nombre}
                className="flex items-center justify-between rounded-xl2 border border-amber-200 bg-amber-50 px-4 py-3 text-sm"
              >
                <span className="flex items-center gap-2 font-medium text-amber-800">
                  <span className="material-symbols-outlined text-lg">warning</span>
                  {a.nombre}
                </span>
                <span className="font-semibold text-amber-800">
                  {cantidad(a.stock)} {a.unidad}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-5 grid grid-cols-2 gap-3">
        <Link href="/ventas" className="btn-primary py-3">
          <span className="material-symbols-outlined">point_of_sale</span>
          Nueva venta
        </Link>
        <Link href="/productos" className="btn-secondary py-3">
          <span className="material-symbols-outlined">add_box</span>
          Nuevo producto
        </Link>
      </section>
    </>
  );
}
