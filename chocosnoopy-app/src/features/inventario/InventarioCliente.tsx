"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import { useToast } from "@/components/Toast";
import { dinero, cantidad } from "@/lib/format";
import type { MateriaPrimaConAlerta } from "@/lib/types";
import {
  guardarMateriaPrima,
  cambiarEstadoMateriaPrima,
  ajustarStock,
} from "./actions";

interface Props {
  materiasPrimas: MateriaPrimaConAlerta[];
}

const FORM_VACIO = {
  id: null as number | null,
  nombre: "",
  unidad: "",
  cantidad_presentacion: "",
  costo_total_compra: "",
  stock_actual: "",
  stock_minimo: "",
  estado: "Activo" as "Activo" | "Inactivo",
};

export default function InventarioCliente({ materiasPrimas }: Props) {
  const router = useRouter();
  const { mostrar } = useToast();
  const [pendiente, iniciarTransicion] = useTransition();

  const [modalAbierto, setModalAbierto] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);

  const alertas = materiasPrimas.filter((m) => m.bajo_minimo);

  function abrirNueva() {
    setForm(FORM_VACIO);
    setModalAbierto(true);
  }

  function abrirEdicion(m: MateriaPrimaConAlerta) {
    setForm({
      id: m.id,
      nombre: m.nombre,
      unidad: m.unidad,
      cantidad_presentacion: String(m.cantidad_presentacion),
      costo_total_compra: String(m.costo_total_compra),
      stock_actual: String(m.stock_actual),
      stock_minimo: String(m.stock_minimo),
      estado: m.estado,
    });
    setModalAbierto(true);
  }

  const costoUnitarioPreview =
    Number(form.cantidad_presentacion) > 0
      ? Number(form.costo_total_compra || 0) / Number(form.cantidad_presentacion)
      : 0;

  async function onGuardar(e: React.FormEvent) {
    e.preventDefault();
    if (guardando) return;
    setGuardando(true);
    const res = await guardarMateriaPrima(form);
    setGuardando(false);
    if (res.ok) {
      mostrar(res.mensaje ?? "Guardado.", "success");
      setModalAbierto(false);
      router.refresh();
    } else {
      mostrar(res.error, "error");
    }
  }

  function onToggle(m: MateriaPrimaConAlerta) {
    iniciarTransicion(async () => {
      const res = await cambiarEstadoMateriaPrima(m.id);
      if (res.ok) {
        mostrar(res.mensaje ?? "Actualizado.", "success");
        router.refresh();
      } else {
        mostrar(res.error, "error");
      }
    });
  }

  function onAjustar(m: MateriaPrimaConAlerta, delta: number) {
    iniciarTransicion(async () => {
      const res = await ajustarStock(m.id, delta);
      if (res.ok) router.refresh();
      else mostrar(res.error, "error");
    });
  }

  return (
    <>
      <PageHeader
        titulo="Inventario"
        subtitulo={`${materiasPrimas.length} materias primas`}
        accion={
          <button className="btn-primary" onClick={abrirNueva}>
            <span className="material-symbols-outlined text-xl">add</span>
            Nueva
          </button>
        }
      />

      {alertas.length > 0 && (
        <div className="mb-4 rounded-xl2 border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <div className="mb-1 flex items-center gap-1 font-semibold">
            <span className="material-symbols-outlined text-lg">warning</span>
            Stock bajo ({alertas.length})
          </div>
          <ul className="list-inside list-disc">
            {alertas.map((a) => (
              <li key={a.id}>
                {a.nombre}: {cantidad(a.stock_actual)} {a.unidad}
              </li>
            ))}
          </ul>
        </div>
      )}

      {materiasPrimas.length === 0 ? (
        <EmptyState
          icono="warehouse"
          titulo="No hay materias primas"
          descripcion="Pulsa «Nueva» para registrar la primera materia prima."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {materiasPrimas.map((m) => (
            <article key={m.id} className="card">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{m.nombre}</h3>
                    {m.bajo_minimo && (
                      <span className="status-pill status-warning">Bajo mínimo</span>
                    )}
                    {m.estado === "Inactivo" && (
                      <span className="status-pill status-muted">Inactiva</span>
                    )}
                  </div>
                  <p className="text-xs text-muted">
                    {dinero(m.costo_unitario)} / {m.unidad}
                  </p>
                </div>
                <button
                  className="btn-ghost !px-2"
                  onClick={() => abrirEdicion(m)}
                  aria-label="Editar"
                >
                  <span className="material-symbols-outlined text-xl">edit</span>
                </button>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
                <div>
                  <div className="text-xs text-muted">Stock</div>
                  <div className="font-semibold">
                    {cantidad(m.stock_actual)} {m.unidad}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted">Mínimo</div>
                  <div className="font-semibold">{cantidad(m.stock_minimo)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted">Presentación</div>
                  <div className="font-semibold">{cantidad(m.cantidad_presentacion)}</div>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <button
                    className="btn-secondary !px-3"
                    disabled={pendiente}
                    onClick={() => onAjustar(m, -1)}
                  >
                    −1
                  </button>
                  <button
                    className="btn-secondary !px-3"
                    disabled={pendiente}
                    onClick={() => onAjustar(m, 1)}
                  >
                    +1
                  </button>
                </div>
                <button
                  className="btn-ghost text-sm"
                  disabled={pendiente}
                  onClick={() => onToggle(m)}
                >
                  {m.estado === "Activo" ? "Desactivar" : "Activar"}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal
        abierto={modalAbierto}
        titulo={form.id ? "Editar materia prima" : "Nueva materia prima"}
        onCerrar={() => setModalAbierto(false)}
        footer={
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setModalAbierto(false)}>
              Cancelar
            </button>
            <button className="btn-primary" form="formMateria" disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar"}
            </button>
          </div>
        }
      >
        <form id="formMateria" onSubmit={onGuardar} className="flex flex-col gap-3">
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
              <label className="form-label">Unidad</label>
              <input
                className="form-control"
                placeholder="g, ml, unidad…"
                value={form.unidad}
                onChange={(e) => setForm({ ...form, unidad: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="form-label">Cant. presentación</label>
              <input
                className="form-control"
                type="number"
                step="any"
                min="0"
                value={form.cantidad_presentacion}
                onChange={(e) => setForm({ ...form, cantidad_presentacion: e.target.value })}
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Costo total compra</label>
              <input
                className="form-control"
                type="number"
                step="any"
                min="0"
                value={form.costo_total_compra}
                onChange={(e) => setForm({ ...form, costo_total_compra: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="form-label">Costo unitario</label>
              <input
                className="form-control bg-gray-50"
                value={dinero(costoUnitarioPreview)}
                readOnly
                tabIndex={-1}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Stock actual</label>
              <input
                className="form-control"
                type="number"
                step="any"
                min="0"
                value={form.stock_actual}
                onChange={(e) => setForm({ ...form, stock_actual: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="form-label">Stock mínimo</label>
              <input
                className="form-control"
                type="number"
                step="any"
                min="0"
                value={form.stock_minimo}
                onChange={(e) => setForm({ ...form, stock_minimo: e.target.value })}
                required
              />
            </div>
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
