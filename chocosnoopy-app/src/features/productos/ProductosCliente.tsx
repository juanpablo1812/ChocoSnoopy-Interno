"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import { useToast } from "@/components/Toast";
import { cantidad, dinero } from "@/lib/format";
import type { MateriaPrima, Producto, TipoProducto } from "@/lib/types";
import { cambiarEstadoProducto, duplicarProducto, guardarProducto } from "./actions";

interface Props { productos: Producto[]; materiasPrimas: MateriaPrima[]; }
interface FilaReceta { materia_prima_id: string; cantidad: string; }
interface FilaComponente { producto_id: string; cantidad: string; }

const FORM_VACIO = {
  id: null as number | null, nombre: "", categoria: "", tipo_producto: "Individual" as TipoProducto,
  precio_venta: "", estado: "Activo" as "Activo" | "Inactivo",
};

function etiquetaTipo(tipo: TipoProducto) { return tipo === "Compuesto" ? "Caja" : "Chocolate"; }

export default function ProductosCliente({ productos, materiasPrimas }: Props) {
  const router = useRouter();
  const { mostrar } = useToast();
  const [pendiente, iniciarTransicion] = useTransition();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [filas, setFilas] = useState<FilaReceta[]>([]);
  const [componentes, setComponentes] = useState<FilaComponente[]>([]);
  const [guardando, setGuardando] = useState(false);

  const mapaMaterias = useMemo(() => new Map(materiasPrimas.map((mp) => [mp.id, mp])), [materiasPrimas]);
  const chocolates = useMemo(() => productos.filter((p) => p.tipo_producto === "Individual"), [productos]);
  const mapaChocolates = useMemo(() => new Map(chocolates.map((p) => [p.id, p])), [chocolates]);
  const costoInsumos = useMemo(() => filas.reduce((total, f) => {
    const mp = mapaMaterias.get(Number(f.materia_prima_id));
    return total + (mp ? Number(mp.costo_unitario) * Number(f.cantidad || 0) : 0);
  }, 0), [filas, mapaMaterias]);
  const costoChocolates = useMemo(() => componentes.reduce((total, f) => {
    const p = mapaChocolates.get(Number(f.producto_id));
    return total + (p ? p.costo_produccion * Number(f.cantidad || 0) : 0);
  }, 0), [componentes, mapaChocolates]);
  const costoProduccion = costoInsumos + (form.tipo_producto === "Compuesto" ? costoChocolates : 0);
  const gananciaPreview = Number(form.precio_venta || 0) - costoProduccion;

  function abrirNuevo(tipo_producto: TipoProducto) {
    setForm({ ...FORM_VACIO, tipo_producto });
    setFilas(tipo_producto === "Individual" ? [{ materia_prima_id: "", cantidad: "" }] : []);
    setComponentes(tipo_producto === "Compuesto" ? [{ producto_id: "", cantidad: "1" }] : []);
    setModalAbierto(true);
  }

  function abrirEdicion(p: Producto) {
    setForm({ id: p.id, nombre: p.nombre, categoria: p.categoria, tipo_producto: p.tipo_producto, precio_venta: String(p.precio_venta), estado: p.estado });
    setFilas(p.recetas.map((r) => ({ materia_prima_id: String(r.materia_prima_id), cantidad: String(r.cantidad) })));
    setComponentes(p.componentes.map((c) => ({ producto_id: String(c.producto_id), cantidad: String(c.cantidad) })));
    setModalAbierto(true);
  }

  function cambiarTipo(tipo_producto: TipoProducto) {
    setForm({ ...form, tipo_producto });
    if (tipo_producto === "Individual" && filas.length === 0) setFilas([{ materia_prima_id: "", cantidad: "" }]);
    if (tipo_producto === "Compuesto" && componentes.length === 0) setComponentes([{ producto_id: "", cantidad: "1" }]);
  }
  function editarFila(indice: number, campo: keyof FilaReceta, valor: string) { setFilas(filas.map((f, i) => i === indice ? { ...f, [campo]: valor } : f)); }
  function editarComponente(indice: number, campo: keyof FilaComponente, valor: string) { setComponentes(componentes.map((f, i) => i === indice ? { ...f, [campo]: valor } : f)); }

  async function onGuardar(e: React.FormEvent) {
    e.preventDefault();
    if (guardando) return;
    const recetas = filas.filter((f) => f.materia_prima_id && Number(f.cantidad) > 0).map((f) => ({ materia_prima_id: Number(f.materia_prima_id), cantidad: Number(f.cantidad) }));
    const chocolatesCaja = componentes.filter((f) => f.producto_id && Number(f.cantidad) > 0).map((f) => ({ producto_id: Number(f.producto_id), cantidad: Number(f.cantidad) }));
    if (form.tipo_producto === "Individual" && recetas.length === 0) { mostrar("Agrega al menos una materia prima al chocolate.", "error"); return; }
    if (form.tipo_producto === "Compuesto" && chocolatesCaja.length === 0) { mostrar("Agrega al menos un chocolate a la caja.", "error"); return; }
    if (new Set(chocolatesCaja.map((c) => c.producto_id)).size !== chocolatesCaja.length) { mostrar("No repitas un chocolate; ajusta su cantidad en una sola línea.", "error"); return; }
    setGuardando(true);
    const res = await guardarProducto({ ...form, recetas, componentes: chocolatesCaja });
    setGuardando(false);
    if (res.ok) { mostrar(res.mensaje ?? "Guardado.", "success"); setModalAbierto(false); router.refresh(); }
    else mostrar(res.error, "error");
  }

  function onToggle(p: Producto) { iniciarTransicion(async () => { const res = await cambiarEstadoProducto(p.id); if (res.ok) { mostrar(res.mensaje ?? "Actualizado.", "success"); router.refresh(); } else mostrar(res.error, "error"); }); }
  function onDuplicar(p: Producto) { iniciarTransicion(async () => { const res = await duplicarProducto(p.id); if (res.ok) { mostrar(res.mensaje ?? "Duplicado.", "success"); router.refresh(); } else mostrar(res.error, "error"); }); }

  return <>
    <PageHeader titulo="Productos" subtitulo={`${productos.length} productos`} accion={
      <div className="flex gap-2">
        <button className="btn-secondary text-sm" onClick={() => abrirNuevo("Individual")}><span className="material-symbols-outlined text-lg">add</span>Chocolate</button>
        <button className="btn-primary text-sm" onClick={() => abrirNuevo("Compuesto")}><span className="material-symbols-outlined text-lg">inventory_2</span>Caja</button>
      </div>
    } />

    {materiasPrimas.length === 0 && <div className="mb-4 rounded-xl2 border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Primero registra materias primas en <strong>Inventario</strong> para crear recetas.</div>}
    {productos.length === 0 ? <EmptyState icono="inventory_2" titulo="No hay productos" descripcion="Crea primero un chocolate individual y luego las cajas que lo incluyen." /> :
      <div className="flex flex-col gap-3">{productos.map((p) => <article key={p.id} className="card">
        <div className="flex items-start justify-between gap-2"><div><div className="flex items-center gap-2"><h3 className="font-semibold">{p.nombre}</h3><span className={p.tipo_producto === "Compuesto" ? "status-pill status-warning" : "status-pill status-success"}>{etiquetaTipo(p.tipo_producto)}</span>{p.estado === "Inactivo" && <span className="status-pill status-muted">Inactivo</span>}</div>{p.categoria && <p className="text-xs text-muted">{p.categoria}</p>}</div><button className="btn-ghost !px-2" onClick={() => abrirEdicion(p)} aria-label="Editar"><span className="material-symbols-outlined text-xl">edit</span></button></div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm"><div><div className="text-xs text-muted">Precio</div><div className="font-semibold">{dinero(p.precio_venta)}</div></div><div><div className="text-xs text-muted">Costo</div><div className="font-semibold">{dinero(p.costo_produccion)}</div></div><div><div className="text-xs text-muted">Ganancia</div><div className="font-semibold text-green-600">{dinero(p.ganancia)}</div></div></div>
        {p.tipo_producto === "Compuesto" && <p className="mt-2 text-xs text-muted">Incluye: {p.componentes.map((c) => `${cantidad(c.cantidad)} × ${c.nombre_producto}`).join(", ")}</p>}
        {p.recetas.length > 0 && <p className="mt-2 text-xs text-muted">{p.tipo_producto === "Compuesto" ? "Insumos de la caja" : "Receta"}: {p.recetas.map((r) => `${r.nombre_materia_prima} (${cantidad(r.cantidad)} ${r.unidad})`).join(", ")}</p>}
        <div className="mt-3 flex items-center justify-end gap-1"><button className="btn-ghost text-sm" disabled={pendiente} onClick={() => onDuplicar(p)}>Duplicar</button><button className="btn-ghost text-sm" disabled={pendiente} onClick={() => onToggle(p)}>{p.estado === "Activo" ? "Desactivar" : "Activar"}</button></div>
      </article>)}</div>}

    <Modal abierto={modalAbierto} titulo={form.id ? `Editar ${etiquetaTipo(form.tipo_producto).toLowerCase()}` : `Nueva ${etiquetaTipo(form.tipo_producto).toLowerCase()}`} onCerrar={() => setModalAbierto(false)} footer={<div className="flex items-center justify-between gap-2"><div className="text-sm"><span className="text-muted">Ganancia: </span><strong className={gananciaPreview >= 0 ? "text-green-600" : "text-rose-600"}>{dinero(gananciaPreview)}</strong></div><div className="flex gap-2"><button className="btn-ghost" onClick={() => setModalAbierto(false)}>Cancelar</button><button className="btn-primary" form="formProducto" disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</button></div></div>}>
      <form id="formProducto" onSubmit={onGuardar} className="flex flex-col gap-3">
        <div><label className="form-label">Tipo de producto</label><div className="grid grid-cols-2 gap-2"><button type="button" className={form.tipo_producto === "Individual" ? "btn-primary" : "btn-secondary"} onClick={() => cambiarTipo("Individual")}>Chocolate individual</button><button type="button" className={form.tipo_producto === "Compuesto" ? "btn-primary" : "btn-secondary"} onClick={() => cambiarTipo("Compuesto")}>Caja compuesta</button></div></div>
        <div><label className="form-label">Nombre</label><input className="form-control" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required /></div>
        <div className="grid grid-cols-2 gap-3"><div><label className="form-label">Categoría</label><input className="form-control" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} /></div><div><label className="form-label">Precio de venta</label><input className="form-control" type="number" step="any" min="0" value={form.precio_venta} onChange={(e) => setForm({ ...form, precio_venta: e.target.value })} required /></div></div>
        {form.tipo_producto === "Compuesto" && <div><div className="mb-1 flex items-center justify-between"><label className="form-label !mb-0">Chocolates incluidos</label><span className="text-xs text-muted">Costo: {dinero(costoChocolates)}</span></div>{chocolates.length === 0 && <p className="mb-2 text-xs text-amber-700">Crea al menos un chocolate individual antes de crear una caja.</p>}<div className="flex flex-col gap-2">{componentes.map((f, i) => <div key={i} className="flex items-center gap-2"><select className="form-select flex-1" value={f.producto_id} onChange={(e) => editarComponente(i, "producto_id", e.target.value)}><option value="">Chocolate…</option>{chocolates.filter((p) => p.id !== form.id).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select><input className="form-control w-20" type="number" min="1" step="1" value={f.cantidad} onChange={(e) => editarComponente(i, "cantidad", e.target.value)} /><button type="button" className="btn-ghost !px-2" onClick={() => setComponentes(componentes.filter((_, j) => j !== i))} aria-label="Quitar chocolate"><span className="material-symbols-outlined text-xl">delete</span></button></div>)}</div><button type="button" className="btn-secondary mt-2 text-sm" onClick={() => setComponentes([...componentes, { producto_id: "", cantidad: "1" }])}><span className="material-symbols-outlined text-lg">add</span>Agregar chocolate</button></div>}
        <div><div className="mb-1 flex items-center justify-between"><label className="form-label !mb-0">{form.tipo_producto === "Compuesto" ? "Insumos propios de la caja (opcional)" : "Receta"}</label><span className="text-xs text-muted">Costo: {dinero(costoInsumos)}</span></div><div className="flex flex-col gap-2">{filas.map((f, i) => <div key={i} className="flex items-center gap-2"><select className="form-select flex-1" value={f.materia_prima_id} onChange={(e) => editarFila(i, "materia_prima_id", e.target.value)}><option value="">Materia prima…</option>{materiasPrimas.map((mp) => <option key={mp.id} value={mp.id}>{mp.nombre} ({mp.unidad})</option>)}</select><input className="form-control w-24" type="number" step="any" min="0" placeholder="Cant." value={f.cantidad} onChange={(e) => editarFila(i, "cantidad", e.target.value)} /><button type="button" className="btn-ghost !px-2" onClick={() => setFilas(filas.filter((_, j) => j !== i))} aria-label="Quitar materia prima"><span className="material-symbols-outlined text-xl">delete</span></button></div>)}</div><button type="button" className="btn-secondary mt-2 text-sm" onClick={() => setFilas([...filas, { materia_prima_id: "", cantidad: "" }])}><span className="material-symbols-outlined text-lg">add</span>Agregar materia prima</button></div>
        <div><label className="form-label">Estado</label><select className="form-select" value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value as "Activo" | "Inactivo" })}><option value="Activo">Activo</option><option value="Inactivo">Inactivo</option></select></div>
      </form>
    </Modal>
  </>;
}
