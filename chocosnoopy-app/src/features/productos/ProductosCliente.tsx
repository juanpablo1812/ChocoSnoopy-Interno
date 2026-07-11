"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import { useToast } from "@/components/Toast";
import { dinero, cantidad } from "@/lib/format";
import type { MateriaPrima, Producto } from "@/lib/types";
import { guardarProducto, cambiarEstadoProducto, duplicarProducto } from "./actions";

interface Props {
  productos: Producto[];
  materiasPrimas: MateriaPrima[];
}

interface FilaReceta {
  materia_prima_id: string;
  cantidad: string;
}

const FORM_VACIO = {
  id: null as number | null,
  nombre: "",
  categoria: "",
  precio_venta: "",
  estado: "Activo" as "Activo" | "Inactivo",
};

export default function ProductosCliente({ productos, materiasPrimas }: Props) {
  const router = useRouter();
  const { mostrar } = useToast();
  const [pendiente, iniciarTransicion] = useTransition();

  const [modalAbierto, setModalAbierto] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [filas, setFilas] = useState<FilaReceta[]>([]);
  const [guardando, setGuardando] = useState(false);

  const mapaMaterias = useMemo(() => {
    const m = new Map<number, MateriaPrima>();
    materiasPrimas.forEach((mp) => m.set(mp.id, mp));
    return m;
  }, [materiasPrimas]);

  const costoProduccion = useMemo(() => {
    return filas.reduce((total, f) => {
      const mp = mapaMaterias.get(Number(f.materia_prima_id));
      if (!mp) return total;
      return total + Number(mp.costo_unitario) * Number(f.cantidad || 0);
    }, 0);
  }, [filas, mapaMaterias]);

  const gananciaPreview = Number(form.precio_venta || 0) - costoProduccion;

  function abrirNuevo() {
    setForm(FORM_VACIO);
    setFilas([{ materia_prima_id: "", cantidad: "" }]);
    setModalAbierto(true);
  }

  function abrirEdicion(p: Producto) {
    setForm({
      id: p.id,
      nombre: p.nombre,
      categoria: p.categoria,
      precio_venta: String(p.precio_venta),
      estado: p.estado,
    });
    setFilas(
      p.recetas.length > 0
        ? p.recetas.map((r) => ({
            materia_prima_id: String(r.materia_prima_id),
            cantidad: String(r.cantidad),
          }))
        : [{ materia_prima_id: "", cantidad: "" }],
    );
    setModalAbierto(true);
  }

  function agregarFila() {
    setFilas([...filas, { materia_prima_id: "", cantidad: "" }]);
  }

  function quitarFila(indice: number) {
    const nuevas = filas.filter((_, i) => i !== indice);
    setFilas(nuevas.length > 0 ? nuevas : [{ materia_prima_id: "", cantidad: "" }]);
  }

  function editarFila(indice: number, campo: keyof FilaReceta, valor: string) {
    setFilas(filas.map((f, i) => (i === indice ? { ...f, [campo]: valor } : f)));
  }

  async function onGuardar(e: React.FormEvent) {
    e.preventDefault();
    if (guardando) return;

    const recetas = filas
      .filter((f) => f.materia_prima_id && Number(f.cantidad) > 0)
      .map((f) => ({
        materia_prima_id: Number(f.materia_prima_id),
        cantidad: Number(f.cantidad),
      }));

    if (recetas.length === 0) {
      mostrar("Agrega al menos una materia prima con cantidad.", "error");
      return;
    }

    setGuardando(true);
    const res = await guardarProducto({
      id: form.id,
      nombre: form.nombre,
      categoria: form.categoria,
      precio_venta: form.precio_venta,
      estado: form.estado,
      recetas,
    });
    setGuardando(false);

    if (res.ok) {
      mostrar(res.mensaje ?? "Guardado.", "success");
      setModalAbierto(false);
      router.refresh();
    } else {
      mostrar(res.error, "error");
    }
  }

  function onToggle(p: Producto) {
    iniciarTransicion(async () => {
      const res = await cambiarEstadoProducto(p.id);
      if (res.ok) {
        mostrar(res.mensaje ?? "Actualizado.", "success");
        router.refresh();
      } else {
        mostrar(res.error, "error");
      }
    });
  }

  function onDuplicar(p: Producto) {
    iniciarTransicion(async () => {
      const res = await duplicarProducto(p.id);
      if (res.ok) {
        mostrar(res.mensaje ?? "Duplicado.", "success");
        router.refresh();
      } else {
        mostrar(res.error, "error");
      }
    });
  }

  return (
    <>
      <PageHeader
        titulo="Productos"
        subtitulo={`${productos.length} productos`}
        accion={
          <button className="btn-primary" onClick={abrirNuevo}>
            <span className="material-symbols-outlined text-xl">add</span>
            Nuevo
          </button>
        }
      />

      {materiasPrimas.length === 0 && (
        <div className="mb-4 rounded-xl2 border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Primero registra materias primas en <strong>Inventario</strong> para poder crear
          recetas.
        </div>
      )}

      {productos.length === 0 ? (
        <EmptyState
          icono="inventory_2"
          titulo="No hay productos"
          descripcion="Pulsa «Nuevo» para crear tu primer producto con su receta."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {productos.map((p) => (
            <article key={p.id} className="card">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{p.nombre}</h3>
                    {p.estado === "Inactivo" && (
                      <span className="status-pill status-muted">Inactivo</span>
                    )}
                  </div>
                  {p.categoria && <p className="text-xs text-muted">{p.categoria}</p>}
                </div>
                <button
                  className="btn-ghost !px-2"
                  onClick={() => abrirEdicion(p)}
                  aria-label="Editar"
                >
                  <span className="material-symbols-outlined text-xl">edit</span>
                </button>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
                <div>
                  <div className="text-xs text-muted">Precio</div>
                  <div className="font-semibold">{dinero(p.precio_venta)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted">Costo</div>
                  <div className="font-semibold">{dinero(p.costo_produccion)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted">Ganancia</div>
                  <div className="font-semibold text-green-600">{dinero(p.ganancia)}</div>
                </div>
              </div>

              {p.recetas.length > 0 && (
                <p className="mt-2 text-xs text-muted">
                  Receta: {p.recetas.map((r) => `${r.nombre_materia_prima} (${cantidad(r.cantidad)} ${r.unidad})`).join(", ")}
                </p>
              )}

              <div className="mt-3 flex items-center justify-end gap-1">
                <button className="btn-ghost text-sm" disabled={pendiente} onClick={() => onDuplicar(p)}>
                  Duplicar
                </button>
                <button className="btn-ghost text-sm" disabled={pendiente} onClick={() => onToggle(p)}>
                  {p.estado === "Activo" ? "Desactivar" : "Activar"}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal
        abierto={modalAbierto}
        titulo={form.id ? "Editar producto" : "Nuevo producto"}
        onCerrar={() => setModalAbierto(false)}
        footer={
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm">
              <span className="text-muted">Ganancia: </span>
              <strong className={gananciaPreview >= 0 ? "text-green-600" : "text-rose-600"}>
                {dinero(gananciaPreview)}
              </strong>
            </div>
            <div className="flex gap-2">
              <button className="btn-ghost" onClick={() => setModalAbierto(false)}>
                Cancelar
              </button>
              <button className="btn-primary" form="formProducto" disabled={guardando}>
                {guardando ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        }
      >
        <form id="formProducto" onSubmit={onGuardar} className="flex flex-col gap-3">
          <div>
            <label className="form-label">Nombre</label>
            <input
              className="form-control"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Categoría</label>
              <input
                className="form-control"
                value={form.categoria}
                onChange={(e) => setForm({ ...form, categoria: e.target.value })}
              />
            </div>
            <div>
              <label className="form-label">Precio de venta</label>
              <input
                className="form-control"
                type="number"
                step="any"
                min="0"
                value={form.precio_venta}
                onChange={(e) => setForm({ ...form, precio_venta: e.target.value })}
                required
              />
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="form-label !mb-0">Receta</label>
              <span className="text-xs text-muted">Costo: {dinero(costoProduccion)}</span>
            </div>
            <div className="flex flex-col gap-2">
              {filas.map((f, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    className="form-select flex-1"
                    value={f.materia_prima_id}
                    onChange={(e) => editarFila(i, "materia_prima_id", e.target.value)}
                  >
                    <option value="">Materia prima…</option>
                    {materiasPrimas.map((mp) => (
                      <option key={mp.id} value={mp.id}>
                        {mp.nombre} ({mp.unidad})
                      </option>
                    ))}
                  </select>
                  <input
                    className="form-control w-24"
                    type="number"
                    step="any"
                    min="0"
                    placeholder="Cant."
                    value={f.cantidad}
                    onChange={(e) => editarFila(i, "cantidad", e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-ghost !px-2"
                    onClick={() => quitarFila(i)}
                    aria-label="Quitar"
                  >
                    <span className="material-symbols-outlined text-xl">delete</span>
                  </button>
                </div>
              ))}
            </div>
            <button type="button" className="btn-secondary mt-2 text-sm" onClick={agregarFila}>
              <span className="material-symbols-outlined text-lg">add</span>
              Agregar materia prima
            </button>
          </div>

          <div>
            <label className="form-label">Estado</label>
            <select
              className="form-select"
              value={form.estado}
              onChange={(e) => setForm({ ...form, estado: e.target.value as "Activo" | "Inactivo" })}
            >
              <option value="Activo">Activo</option>
              <option value="Inactivo">Inactivo</option>
            </select>
          </div>
        </form>
      </Modal>
    </>
  );
}
