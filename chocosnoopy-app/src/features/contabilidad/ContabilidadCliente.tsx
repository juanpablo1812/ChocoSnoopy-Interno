"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { dinero } from "@/lib/format";
import type { ComparacionContable, DatosContabilidad, PeriodoContable, ProductoVendido, PuntoEvolucion } from "./data";

const PERIODOS: { valor: Exclude<PeriodoContable, "personalizado">; etiqueta: string }[] = [
  { valor: "hoy", etiqueta: "Hoy" },
  { valor: "semana", etiqueta: "Semana" },
  { valor: "mes", etiqueta: "Mes" },
];

function cambio(comparacion: ComparacionContable, unidad: "ventas" | "dinero") {
  const subio = comparacion.diferencia > 0;
  const bajo = comparacion.diferencia < 0;
  const color = subio ? "text-success" : bajo ? "text-danger" : "text-muted";
  const signo = subio ? "+" : "";
  const absoluto = unidad === "dinero" ? dinero(Math.abs(comparacion.diferencia)) : Math.abs(comparacion.diferencia).toString();
  const porcentaje = comparacion.porcentaje === null
    ? "Nuevo"
    : `${signo}${comparacion.porcentaje.toLocaleString("es-CO", { maximumFractionDigits: 1 })}%`;
  return <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${color}`}>
    <span className="material-symbols-outlined text-sm">{subio ? "trending_up" : bajo ? "trending_down" : "remove"}</span>
    {signo}{absoluto} · {porcentaje}
  </span>;
}

function TarjetaMetrica({ titulo, valor, comparacion, unidad }: {
  titulo: string; valor: string; comparacion: ComparacionContable; unidad: "ventas" | "dinero";
}) {
  return <article className="card">
    <p className="text-xs font-medium text-muted">{titulo}</p>
    <p className="mt-1 text-2xl font-bold text-ink">{valor}</p>
    <div className="mt-1">{cambio(comparacion, unidad)}</div>
    <p className="mt-0.5 text-[10px] text-muted">vs. periodo anterior</p>
  </article>;
}

function Grafico({ titulo, puntos, campo, moneda = false }: {
  titulo: string; puntos: PuntoEvolucion[]; campo: "ventas" | "dinero"; moneda?: boolean;
}) {
  const valores = puntos.map((p) => p[campo]);
  const maximo = Math.max(...valores, 1);
  const ancho = 320;
  const alto = 118;
  const margen = 10;
  const separacion = puntos.length > 1 ? (ancho - margen * 2) / (puntos.length - 1) : 0;
  const coordenadas = valores.map((valor, indice) => {
    const x = margen + indice * separacion;
    const y = alto - margen - (valor / maximo) * (alto - margen * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const total = valores.reduce((suma, valor) => suma + valor, 0);
  const etiquetas = puntos.length <= 7 ? puntos : [puntos[0], puntos[puntos.length - 1]];

  return <article className="card overflow-hidden">
    <div className="flex items-start justify-between gap-2">
      <div><h2 className="font-semibold">{titulo}</h2><p className="text-xs text-muted">Comportamiento durante el periodo</p></div>
      <strong className="text-sm text-accent">{moneda ? dinero(total) : total}</strong>
    </div>
    <svg className="mt-3 h-32 w-full" viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={`${titulo}: ${moneda ? dinero(total) : total} en total`} preserveAspectRatio="none">
      <line x1={margen} y1={alto - margen} x2={ancho - margen} y2={alto - margen} stroke="rgba(231,159,180,.45)" strokeWidth="1" />
      <line x1={margen} y1={alto / 2} x2={ancho - margen} y2={alto / 2} stroke="rgba(231,159,180,.2)" strokeWidth="1" strokeDasharray="3 3" />
      <polyline points={coordenadas} fill="none" stroke="#FE3F47" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {valores.map((valor, indice) => {
        const [x, y] = coordenadas.split(" ")[indice].split(",");
        return <circle key={indice} cx={x} cy={y} r="3" fill="#FFFFFF" stroke="#FE3F47" strokeWidth="2" vectorEffect="non-scaling-stroke"><title>{`${puntos[indice].etiqueta}: ${moneda ? dinero(valor) : valor}`}</title></circle>;
      })}
    </svg>
    <div className="flex justify-between text-[10px] text-muted">{etiquetas.map((punto) => <span key={punto.etiqueta}>{punto.etiqueta}</span>)}</div>
  </article>;
}

function ProductosVendidos({ productos }: { productos: ProductoVendido[] }) {
  const totalUnidades = productos.reduce((total, producto) => total + producto.unidades, 0);

  return <section className="mt-5">
    <div className="mb-2 flex items-end justify-between gap-3">
      <div><h2 className="text-lg font-semibold">Productos vendidos</h2><p className="text-xs text-muted">Detalle de las ventas creadas durante el período.</p></div>
      {productos.length > 0 && <span className="shrink-0 text-xs font-semibold text-accent">{totalUnidades} {totalUnidades === 1 ? "unidad" : "unidades"}</span>}
    </div>
    {productos.length === 0
      ? <div className="card text-center"><span className="material-symbols-outlined text-3xl text-primary-dark">inventory_2</span><p className="mt-1 text-sm font-medium">No se vendieron productos</p><p className="mt-1 text-xs text-muted">No hay ventas activas registradas en este período.</p></div>
      : <div className="card divide-y divide-primary-dark/20 !p-0">
        {productos.map((producto) => <article key={producto.producto_id} className="p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><h3 className="truncate text-sm font-semibold text-ink">{producto.nombre}</h3><p className="mt-0.5 text-xs text-muted">{producto.ventas} {producto.ventas === 1 ? "venta" : "ventas"}</p></div>
            <strong className="shrink-0 text-sm text-accent">{producto.unidades} {producto.unidades === 1 ? "unidad" : "unidades"}</strong>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs"><span className="text-muted">Valor vendido</span><strong>{dinero(producto.valor_vendido)}</strong></div>
        </article>)}
      </div>}
  </section>;
}

export default function ContabilidadCliente({ datos }: { datos: DatosContabilidad }) {
  const router = useRouter();
  const [panelAbierto, setPanelAbierto] = useState<"dia" | "rango" | null>(
    datos.periodo === "dia" ? "dia" : datos.periodo === "personalizado" ? "rango" : null,
  );
  const [desde, setDesde] = useState(datos.desde);
  const [hasta, setHasta] = useState(datos.hasta);
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  const [fecha, setFecha] = useState(datos.periodo === "dia" ? datos.desde : hoy);
  const seleccionActiva = panelAbierto ?? (datos.periodo === "dia" ? "dia" : datos.periodo === "personalizado" ? "rango" : null);

  function cambiarPeriodo(periodo: string) {
    setPanelAbierto(null);
    router.push(`/contabilidad?periodo=${periodo}`);
  }

  function aplicarDia(e: React.FormEvent) {
    e.preventDefault();
    if (fecha && fecha <= hoy) router.push(`/contabilidad?periodo=dia&fecha=${fecha}`);
  }

  function aplicarRango(e: React.FormEvent) {
    e.preventDefault();
    if (desde && hasta && desde <= hasta) router.push(`/contabilidad?periodo=personalizado&desde=${desde}&hasta=${hasta}`);
  }

  return <>
    <PageHeader titulo="Contabilidad" subtitulo="Resumen financiero" />

    <section className="mb-4">
      <div className="flex rounded-xl2 bg-primary-dark/35 p-1">
        {PERIODOS.map((item) => <button key={item.valor} onClick={() => cambiarPeriodo(item.valor)} className={`flex-1 rounded-xl px-2 py-2 text-xs font-semibold transition ${seleccionActiva === null && datos.periodo === item.valor ? "bg-secondary text-accent shadow-sm" : "text-ink/70"}`}>{item.etiqueta}</button>)}
        <button onClick={() => setPanelAbierto((actual) => actual === "dia" ? null : "dia")} className={`flex-1 rounded-xl px-2 py-2 text-xs font-semibold transition ${seleccionActiva === "dia" ? "bg-secondary text-accent shadow-sm" : "text-ink/70"}`}>Día</button>
        <button onClick={() => setPanelAbierto((actual) => actual === "rango" ? null : "rango")} className={`flex-1 rounded-xl px-2 py-2 text-xs font-semibold transition ${seleccionActiva === "rango" ? "bg-secondary text-accent shadow-sm" : "text-ink/70"}`}>Rango</button>
      </div>
      {panelAbierto === "dia" && <form onSubmit={aplicarDia} className="mt-3 rounded-xl2 bg-surface p-3 shadow-card">
        <p className="mb-2 text-xs text-muted">Consulta las ventas y el dinero recibido en una fecha específica.</p>
        <label className="text-xs font-medium">Fecha<input required max={hoy} value={fecha} onChange={(e) => setFecha(e.target.value)} type="date" className="form-control mt-1" /></label>
        <button className="btn-primary mt-3 w-full text-sm">Ver día</button>
      </form>}
      {panelAbierto === "rango" && <form onSubmit={aplicarRango} className="mt-3 rounded-xl2 bg-surface p-3 shadow-card">
        <p className="mb-2 text-xs text-muted">Compara un período de hasta 366 días con el período inmediatamente anterior.</p>
        <div className="grid grid-cols-2 gap-2"><label className="text-xs font-medium">Desde<input required max={hoy} value={desde} onChange={(e) => setDesde(e.target.value)} type="date" className="form-control mt-1" /></label><label className="text-xs font-medium">Hasta<input required min={desde} max={hoy} value={hasta} onChange={(e) => setHasta(e.target.value)} type="date" className="form-control mt-1" /></label></div>
        <button className="btn-primary mt-3 w-full text-sm">Ver reporte</button>
      </form>}
    </section>

    <section className="grid grid-cols-2 gap-3">
      <TarjetaMetrica titulo="Cantidad de ventas" valor={datos.resumen.ventas.toString()} comparacion={datos.comparacion.ventas} unidad="ventas" />
      <TarjetaMetrica titulo="Dinero recogido" valor={dinero(datos.resumen.dinero)} comparacion={datos.comparacion.dinero} unidad="dinero" />
    </section>

    <section className="card mt-3 bg-secondary">
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium text-muted">Utilidad estimada</p><p className="mt-1 text-2xl font-bold text-success">{dinero(datos.resumen.utilidad)}</p></div><span className="material-symbols-outlined rounded-full border-2 border-accent bg-secondary p-2 text-accent">savings</span></div>
      <p className="mt-2 text-xs text-muted">Lo cobrado menos el costo estimado de los productos pagados.</p>
    </section>

    <section className="mt-5"><div className="mb-2"><h2 className="text-lg font-semibold">Ingresos, costos y utilidad</h2><p className="text-xs text-muted">Desglose del dinero efectivamente recibido.</p></div>
      <div className="card divide-y divide-primary-dark/20 !p-0"><div className="flex items-center justify-between p-3 text-sm"><span>Ingresos por ventas</span><strong>{dinero(datos.resumen.ingresos_ventas)}</strong></div><div className="flex items-center justify-between p-3 text-sm"><span className="text-success">Propinas</span><strong className="text-success">{dinero(datos.resumen.propinas)}</strong></div><div className="flex items-center justify-between p-3 text-sm"><span className="text-danger">Costos estimados</span><strong className="text-danger">−{dinero(datos.resumen.costos)}</strong></div><div className="flex items-center justify-between bg-secondary p-3 text-sm"><strong>Utilidad estimada</strong><strong className="text-success">{dinero(datos.resumen.utilidad)}</strong></div></div>
    </section>

    <ProductosVendidos productos={datos.productos_vendidos} />

    <section className="mt-5 flex flex-col gap-3"><Grafico titulo="Ventas durante el periodo" puntos={datos.evolucion} campo="ventas" /><Grafico titulo="Dinero recogido durante el periodo" puntos={datos.evolucion} campo="dinero" moneda /></section>
    <p className="mt-4 text-center text-[11px] leading-relaxed text-muted">Las ventas se cuentan por su fecha de creaci\u00f3n; el dinero, costos y utilidad se registran por la fecha en que se recibi\u00f3 cada pago.</p>
  </>;
}
