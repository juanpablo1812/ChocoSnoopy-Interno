"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import { useToast } from "@/components/Toast";
import { dinero, fechaCorta, hoyISO } from "@/lib/format";
import type { EstadoVenta, Venta } from "@/lib/types";
import type { ProductoVenta } from "./data";
import { crearVenta, cambiarEstadoVenta } from "./actions";

interface Props {
  ventas: Venta[];
  productos: ProductoVenta[];
}

interface Linea {
  producto_id: string;
  cantidad: string;
}

function estadoPill(estado: EstadoVenta): { clase: string; texto: string } {
  if (estado === "Entregada") return { clase: "status-success", texto: "Entregada" };
  if (estado === "Cancelada") return { clase: "status-danger", texto: "Cancelada" };
  return { clase: "status-warning", texto: "Pendiente" };
}

export default function VentasCliente({ ventas, productos }: Props) {
  const router = useRouter();
  const { mostrar } = useToast();
  const [pendiente, iniciarTransicion] = useTransition();

  const [modalAbierto, setModalAbierto] = useState(false);
  const [cliente, setCliente] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [fechaEntrega, setFechaEntrega] = useState(hoyISO());
  const [estado, setEstado] = useState<"Pendiente" | "Entregada">("Pendiente");
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [guardando, setGuardando] = useState(false);

  const mapaProductos = useMemo(() => {
    const m = new Map<number, ProductoVenta>();
    productos.forEach((p) => m.set(p.id, p));
    return m;
  }, [productos]);

  const total = useMemo(() => {
    return lineas.reduce((t, l) => {
      const p = mapaProductos.get(Number(l.producto_id));
      if (!p) return t;
      return t + p.precio_venta * Number(l.cantidad || 0);
    }, 0);
  }, [lineas, mapaProductos]);

  function abrirModal() {
    setCliente("");
    setWhatsapp("");
    setFechaEntrega(hoyISO());
    setEstado("Pendiente");
    setLineas([{ producto_id: "", cantidad: "1" }]);
    setModalAbierto(true);
  }

  function agregarLinea() {
    setLineas([...lineas, { producto_id: "", cantidad: "1" }]);
  }

  function quitarLinea(indice: number) {
    const nuevas = lineas.filter((_, i) => i !== indice);
    setLineas(nuevas.length > 0 ? nuevas : [{ producto_id: "", cantidad: "1" }]);
  }

  function editarLinea(indice: number, campo: keyof Linea, valor: string) {
    setLineas(lineas.map((l, i) => (i === indice ? { ...l, [campo]: valor } : l)));
  }

  async function onGuardar(e: React.FormEvent) {
    e.preventDefault();
    if (guardando) return;

    const seleccionados = lineas.filter((l) => l.producto_id && Number(l.cantidad) > 0);
    if (seleccionados.length === 0) {
      mostrar("Agrega al menos un producto.", "error");
      return;
    }
    const ids = seleccionados.map((l) => l.producto_id);
    if (new Set(ids).size !== ids.length) {
      mostrar("No repitas el mismo producto; suma la cantidad en una sola línea.", "error");
      return;
    }

    setGuardando(true);
    const res = await crearVenta({
      cliente,
      whatsapp,
      fecha_entrega: fechaEntrega,
      estado,
      productos: seleccionados.map((l) => ({
        producto_id: Number(l.producto_id),
        cantidad: Number(l.cantidad),
      })),
    });
    setGuardando(false);

    if (res.ok) {
      mostrar(res.mensaje ?? "Venta guardada.", "success");
      setModalAbierto(false);
      router.refresh();
    } else {
      mostrar(res.error, "error");
    }
  }

  function onCambiarEstado(v: Venta, nuevo: EstadoVenta) {
    iniciarTransicion(async () => {
      const res = await cambiarEstadoVenta(v.id, nuevo);
      if (res.ok) {
        mostrar(res.mensaje ?? "Actualizado.", "success");
        router.refresh();
      } else {
        mostrar(res.error, "error");
      }
    });
  }

  return (
    <>
      <PageHeader
        titulo="Ventas"
        subtitulo={`${ventas.length} ventas`}
        accion={
          <button className="btn-primary" onClick={abrirModal}>
            <span className="material-symbols-outlined text-xl">add</span>
            Nueva
          </button>
        }
      />

      {productos.length === 0 && (
        <div className="mb-4 rounded-xl2 border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          No hay productos vendibles. Crea productos con receta en <strong>Productos</strong>.
        </div>
      )}

      {ventas.length === 0 ? (
        <EmptyState
          icono="shopping_cart"
          titulo="No hay ventas registradas"
          descripcion="Pulsa «Nueva» para crear la primera venta."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {ventas.map((v) => {
            const pill = estadoPill(v.estado);
            return (
              <article key={v.id} className="card">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">{v.cliente || "Consumidor final"}</h3>
                    <p className="text-xs text-muted">Venta #{v.id}</p>
                  </div>
                  <span className={`status-pill ${pill.clase}`}>{pill.texto}</span>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
                  <div>
                    <div className="text-xs text-muted">Productos</div>
                    <div className="font-semibold">{v.cantidad_productos}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted">Entrega</div>
                    <div className="font-semibold">{fechaCorta(v.fecha_entrega)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted">Total</div>
                    <div className="font-semibold">{dinero(v.total)}</div>
                  </div>
                </div>

                {v.estado === "Pendiente" && (
                  <div className="mt-3 flex items-center justify-end gap-1">
                    <button
                      className="btn-ghost text-sm text-rose-600"
                      disabled={pendiente}
                      onClick={() => onCambiarEstado(v, "Cancelada")}
                    >
                      Cancelar
                    </button>
                    <button
                      className="btn-secondary text-sm"
                      disabled={pendiente}
                      onClick={() => onCambiarEstado(v, "Entregada")}
                    >
                      Marcar entregada
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <Modal
        abierto={modalAbierto}
        titulo="Nueva venta"
        onCerrar={() => setModalAbierto(false)}
        footer={
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm">
              <span className="text-muted">Total: </span>
              <strong className="text-base">{dinero(total)}</strong>
            </div>
            <div className="flex gap-2">
              <button className="btn-ghost" onClick={() => setModalAbierto(false)}>
                Cancelar
              </button>
              <button className="btn-primary" form="formVenta" disabled={guardando}>
                {guardando ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        }
      >
        <form id="formVenta" onSubmit={onGuardar} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Cliente</label>
              <input
                className="form-control"
                placeholder="Consumidor final"
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
              />
            </div>
            <div>
              <label className="form-label">WhatsApp</label>
              <input
                className="form-control"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Fecha de entrega</label>
              <input
                className="form-control"
                type="date"
                value={fechaEntrega}
                onChange={(e) => setFechaEntrega(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="form-label">Estado</label>
              <select
                className="form-select"
                value={estado}
                onChange={(e) => setEstado(e.target.value as "Pendiente" | "Entregada")}
              >
                <option value="Pendiente">Pendiente</option>
                <option value="Entregada">Entregada</option>
              </select>
            </div>
          </div>

          <div>
            <label className="form-label">Productos</label>
            <div className="flex flex-col gap-2">
              {lineas.map((l, i) => {
                const p = mapaProductos.get(Number(l.producto_id));
                const subtotal = p ? p.precio_venta * Number(l.cantidad || 0) : 0;
                return (
                  <div key={i} className="rounded-xl border border-black/10 p-2">
                    <div className="flex items-center gap-2">
                      <select
                        className="form-select flex-1"
                        value={l.producto_id}
                        onChange={(e) => editarLinea(i, "producto_id", e.target.value)}
                      >
                        <option value="">Selecciona un producto…</option>
                        {productos.map((prod) => (
                          <option key={prod.id} value={prod.id}>
                            {prod.nombre}
                          </option>
                        ))}
                      </select>
                      <input
                        className="form-control w-20"
                        type="number"
                        min="1"
                        step="1"
                        value={l.cantidad}
                        onChange={(e) => editarLinea(i, "cantidad", e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn-ghost !px-2"
                        onClick={() => quitarLinea(i)}
                        aria-label="Quitar"
                      >
                        <span className="material-symbols-outlined text-xl">delete</span>
                      </button>
                    </div>
                    <div className="mt-1 flex justify-between px-1 text-xs text-muted">
                      <span>{p ? dinero(p.precio_venta) + " c/u" : "—"}</span>
                      <span>Subtotal: {dinero(subtotal)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <button type="button" className="btn-secondary mt-2 text-sm" onClick={agregarLinea}>
              <span className="material-symbols-outlined text-lg">add</span>
              Agregar producto
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
