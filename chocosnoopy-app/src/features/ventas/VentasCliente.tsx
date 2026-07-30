"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import { useToast } from "@/components/Toast";
import { dinero, fechaCorta, hoyISO } from "@/lib/format";
import type { EstadoVenta, MetodoPago, Venta } from "@/lib/types";
import type { ProductoVenta } from "./data";
import { agregarPagosVenta, cambiarEstadoVenta, crearVenta } from "./actions";

interface Props {
  ventas: Venta[];
  productos: ProductoVenta[];
}

interface Linea {
  producto_id: string;
  cantidad: string;
  selecciones: Record<string, string[]>;
}

interface PagoFormulario {
  monto: string;
  metodo: MetodoPago;
}

interface EditorPagosProps {
  pagos: PagoFormulario[];
  numeroInicial: number;
  onChange: (pagos: PagoFormulario[]) => void;
}

function estadoPill(estado: EstadoVenta): { clase: string; texto: string } {
  if (estado === "Entregada") return { clase: "status-success", texto: "Entregada" };
  if (estado === "Cancelada") return { clase: "status-danger", texto: "Cancelada" };
  return { clase: "status-warning", texto: "Pendiente" };
}

function sumaPagos(pagos: { monto: number }[]): number {
  return pagos.reduce((total, pago) => total + Number(pago.monto || 0), 0);
}

function EditorPagos({ pagos, numeroInicial, onChange }: EditorPagosProps) {
  function agregarPago() {
    onChange([...pagos, { monto: "", metodo: "Efectivo" }]);
  }

  function editarPago(indice: number, campo: keyof PagoFormulario, valor: string) {
    onChange(
      pagos.map((pago, i) =>
        i === indice
          ? { ...pago, [campo]: campo === "metodo" ? (valor as MetodoPago) : valor }
          : pago,
      ),
    );
  }

  function quitarPago(indice: number) {
    onChange(pagos.filter((_, i) => i !== indice));
  }

  return (
    <div>
      <label className="form-label">Pagos recibidos</label>
      <p className="mb-2 text-xs text-muted">
        Agrega cada abono con el medio por el que se recibió. Puedes dejarlo vacío si aún no ha pagado.
      </p>

      <div className="flex flex-col gap-2">
        {pagos.map((pago, indice) => (
          <div key={indice} className="rounded-xl border border-black/10 p-2">
            <div className="mb-1 text-xs font-semibold text-muted">Pago {numeroInicial + indice + 1}</div>
            <div className="flex items-center gap-2">
              <input
                className="form-control min-w-0 flex-1"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Monto"
                value={pago.monto}
                onChange={(e) => editarPago(indice, "monto", e.target.value)}
              />
              <select
                className="form-select w-36"
                value={pago.metodo}
                onChange={(e) => editarPago(indice, "metodo", e.target.value)}
              >
                <option value="Efectivo">Efectivo</option>
                <option value="Transferencia">Transferencia</option>
              </select>
              <button
                type="button"
                className="btn-ghost !px-2"
                onClick={() => quitarPago(indice)}
                aria-label={`Quitar pago ${numeroInicial + indice + 1}`}
              >
                <span className="material-symbols-outlined text-xl">delete</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      <button type="button" className="btn-secondary mt-2 text-sm" onClick={agregarPago}>
        <span className="material-symbols-outlined text-lg">add</span>
        Agregar pago
      </button>
    </div>
  );
}

function CampoPropina({ valor, onChange }: { valor: string; onChange: (valor: string) => void }) {
  return (
    <div>
      <label className="form-label">Propina (opcional)</label>
      <input
        className="form-control"
        type="number"
        min="0"
        step="0.01"
        placeholder="0"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
      />
      <p className="mt-1 text-xs text-muted">Se registra como ganancia adicional y no reduce el saldo de la venta.</p>
    </div>
  );
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
  const [pagos, setPagos] = useState<PagoFormulario[]>([]);
  const [propina, setPropina] = useState("");
  const [guardando, setGuardando] = useState(false);

  const [ventaParaPago, setVentaParaPago] = useState<Venta | null>(null);
  const [pagosNuevos, setPagosNuevos] = useState<PagoFormulario[]>([]);
  const [propinaNueva, setPropinaNueva] = useState("");
  const [guardandoPago, setGuardandoPago] = useState(false);

  const mapaProductos = useMemo(() => {
    const m = new Map<number, ProductoVenta>();
    productos.forEach((p) => m.set(p.id, p));
    return m;
  }, [productos]);

  const chocolatesPorTipo = useMemo(() => {
    const mapa = new Map<string, ProductoVenta[]>();
    productos
      .filter((producto) => producto.tipo_producto === "Individual")
      .forEach((producto) => {
        const lista = mapa.get(producto.tipo_normalizado) ?? [];
        lista.push(producto);
        mapa.set(producto.tipo_normalizado, lista);
      });
    return mapa;
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
    setLineas([{ producto_id: "", cantidad: "1", selecciones: {} }]);
    setPagos([]);
    setPropina("");
    setModalAbierto(true);
  }

  function agregarLinea() {
    setLineas([...lineas, { producto_id: "", cantidad: "1", selecciones: {} }]);
  }

  function quitarLinea(indice: number) {
    const nuevas = lineas.filter((_, i) => i !== indice);
    setLineas(
      nuevas.length > 0
        ? nuevas
        : [{ producto_id: "", cantidad: "1", selecciones: {} }],
    );
  }

  function editarLinea(indice: number, campo: "producto_id" | "cantidad", valor: string) {
    setLineas(
      lineas.map((linea, i) =>
        i === indice ? { ...linea, [campo]: valor, selecciones: {} } : linea,
      ),
    );
  }

  function editarSeleccion(
    indiceLinea: number,
    tipoNormalizado: string,
    indiceCupo: number,
    productoId: string,
  ) {
    setLineas(
      lineas.map((linea, i) => {
        if (i !== indiceLinea) return linea;
        const actuales = linea.selecciones[tipoNormalizado] ?? [];
        const nuevas = [...actuales];
        nuevas[indiceCupo] = productoId;
        return {
          ...linea,
          selecciones: { ...linea.selecciones, [tipoNormalizado]: nuevas },
        };
      }),
    );
  }

  function prepararPagos(pagosFormulario: PagoFormulario[]): PagoFormulario[] | null {
    const pagosConMonto = pagosFormulario.filter((pago) => pago.monto.trim() !== "");
    if (pagosConMonto.some((pago) => !Number.isFinite(Number(pago.monto)) || Number(pago.monto) <= 0)) {
      mostrar("Cada pago debe ser mayor que cero.", "error");
      return null;
    }
    return pagosConMonto;
  }

  function prepararPropina(valor: string): number | null {
    if (valor.trim() === "") return 0;
    const monto = Number(valor);
    if (!Number.isFinite(monto) || monto < 0) {
      mostrar("La propina no puede ser negativa.", "error");
      return null;
    }
    return monto;
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

    for (const linea of seleccionados) {
      const producto = mapaProductos.get(Number(linea.producto_id));
      if (!producto || producto.tipo_producto !== "Compuesto") continue;
      for (const componente of producto.componentes) {
        const requeridos = componente.cantidad * Number(linea.cantidad);
        const elegidos = (linea.selecciones[componente.tipo_normalizado] ?? []).slice(0, requeridos);
        if (elegidos.length !== requeridos || elegidos.some((id) => !id)) {
          mostrar(
            `Completa los ${requeridos} chocolates de tipo ${componente.tipo_chocolate} para ${producto.nombre}.`,
            "error",
          );
          return;
        }
      }
    }

    const pagosValidos = prepararPagos(pagos);
    if (!pagosValidos) return;
    const propinaValida = prepararPropina(propina);
    if (propinaValida === null) return;
    const montoPagado = sumaPagos(pagosValidos.map((pago) => ({ monto: Number(pago.monto) })));
    if (montoPagado > total + 0.001) {
      mostrar("Los pagos no pueden superar el total de la venta.", "error");
      return;
    }

    setGuardando(true);
    const res = await crearVenta({
      cliente,
      whatsapp,
      fecha_entrega: fechaEntrega,
      estado,
      productos: seleccionados.map((linea) => {
        const producto = mapaProductos.get(Number(linea.producto_id));
        const cantidades = new Map<number, number>();
        if (producto?.tipo_producto === "Compuesto") {
          producto.componentes.forEach((componente) => {
            const requeridos = componente.cantidad * Number(linea.cantidad);
            (linea.selecciones[componente.tipo_normalizado] ?? [])
              .slice(0, requeridos)
              .forEach((id) => {
                const productoId = Number(id);
                cantidades.set(productoId, (cantidades.get(productoId) ?? 0) + 1);
              });
          });
        }
        return {
          producto_id: Number(linea.producto_id),
          cantidad: Number(linea.cantidad),
          selecciones: [...cantidades].map(([producto_id, cantidad]) => ({
            producto_id,
            cantidad,
          })),
        };
      }),
      pagos: pagosValidos.map((pago) => ({
        monto: Number(pago.monto),
        metodo: pago.metodo,
      })),
      propina: propinaValida,
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

  function abrirPagos(venta: Venta) {
    setVentaParaPago(venta);
    setPagosNuevos([]);
    setPropinaNueva("");
  }

  async function onGuardarPagos(e: React.FormEvent) {
    e.preventDefault();
    if (!ventaParaPago || guardandoPago) return;

    const pagosValidos = prepararPagos(pagosNuevos);
    if (!pagosValidos || pagosValidos.length === 0) {
      if (pagosValidos?.length === 0) mostrar("Agrega al menos un pago.", "error");
      return;
    }
    const propinaValida = prepararPropina(propinaNueva);
    if (propinaValida === null) return;

    const yaPagado = sumaPagos(ventaParaPago.pagos);
    const saldo = Math.max(0, Number(ventaParaPago.total) - yaPagado);
    const nuevoPago = sumaPagos(pagosValidos.map((pago) => ({ monto: Number(pago.monto) })));
    if (nuevoPago > saldo + 0.001) {
      mostrar("Los pagos no pueden superar el saldo pendiente.", "error");
      return;
    }

    setGuardandoPago(true);
    const res = await agregarPagosVenta(ventaParaPago.id, {
      pagos: pagosValidos.map((pago) => ({ monto: Number(pago.monto), metodo: pago.metodo })),
      propina: propinaValida,
    });
    setGuardandoPago(false);

    if (res.ok) {
      mostrar(res.mensaje ?? "Pago registrado.", "success");
      setVentaParaPago(null);
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
            const pagado = sumaPagos(v.pagos);
            const propinas = sumaPagos(v.propinas);
            const saldo = Math.max(0, Number(v.total) - pagado);
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

                <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-surface p-2 text-center text-sm">
                  <div>
                    <div className="text-xs text-muted">Cobrado</div>
                    <div className="font-semibold text-green-600">{dinero(pagado + propinas)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted">Saldo pendiente</div>
                    <div className="font-semibold text-amber-700">{dinero(saldo)}</div>
                  </div>
                </div>

                {v.pagos.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1 text-xs text-muted">
                    {v.pagos.map((pago) => (
                      <div key={pago.id} className="flex justify-between">
                        <span>Pago {pago.numero} · {pago.metodo}</span>
                        <span className="font-medium text-foreground">{dinero(pago.monto)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {propinas > 0 && (
                  <div className="mt-2 flex justify-between text-xs text-green-700">
                    <span>Propinas</span>
                    <span className="font-semibold">{dinero(propinas)}</span>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-center justify-end gap-1">
                  {v.estado !== "Cancelada" && saldo > 0 && (
                    <button className="btn-secondary text-sm" onClick={() => abrirPagos(v)}>
                      Registrar pago
                    </button>
                  )}
                  {v.estado === "Pendiente" && (
                    <>
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
                    </>
                  )}
                </div>
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
                            {prod.tipo_producto === "Compuesto" ? "[Caja] " : "[Chocolate] "}{prod.nombre}
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
                    {p?.tipo_producto === "Compuesto" && (
                      <div className="mt-3 flex flex-col gap-3 border-t border-black/10 pt-3">
                        <p className="text-xs font-semibold">
                          Elige los chocolates concretos de la caja
                        </p>
                        {p.componentes.map((componente) => {
                          const cupos =
                            componente.cantidad *
                            Math.max(0, Math.trunc(Number(l.cantidad || 0)));
                          const opciones =
                            chocolatesPorTipo.get(componente.tipo_normalizado) ?? [];
                          const elegidos =
                            l.selecciones[componente.tipo_normalizado] ?? [];
                          return (
                            <div key={componente.tipo_normalizado}>
                              <div className="mb-1 text-xs text-muted">
                                {componente.tipo_chocolate} · {cupos}{" "}
                                {cupos === 1 ? "chocolate" : "chocolates"}
                              </div>
                              <div className="grid gap-2 sm:grid-cols-2">
                                {Array.from({ length: cupos }, (_, indiceCupo) => (
                                  <select
                                    key={indiceCupo}
                                    className="form-select min-w-0"
                                    aria-label={`${componente.tipo_chocolate} ${indiceCupo + 1}`}
                                    value={elegidos[indiceCupo] ?? ""}
                                    onChange={(e) =>
                                      editarSeleccion(
                                        i,
                                        componente.tipo_normalizado,
                                        indiceCupo,
                                        e.target.value,
                                      )
                                    }
                                  >
                                    <option value="">
                                      {componente.tipo_chocolate} #{indiceCupo + 1}…
                                    </option>
                                    {opciones.map((opcion) => (
                                      <option key={opcion.id} value={opcion.id}>
                                        {opcion.nombre}
                                      </option>
                                    ))}
                                  </select>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                        <p className="text-xs text-muted">
                          En cada lista solo aparecen chocolates del tipo solicitado.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <button type="button" className="btn-secondary mt-2 text-sm" onClick={agregarLinea}>
              <span className="material-symbols-outlined text-lg">add</span>
              Agregar producto
            </button>
          </div>

          <EditorPagos pagos={pagos} numeroInicial={0} onChange={setPagos} />
          <CampoPropina valor={propina} onChange={setPropina} />
        </form>
      </Modal>

      <Modal
        abierto={Boolean(ventaParaPago)}
        titulo={ventaParaPago ? `Pagos de venta #${ventaParaPago.id}` : "Registrar pago"}
        onCerrar={() => setVentaParaPago(null)}
        footer={
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setVentaParaPago(null)}>
              Cancelar
            </button>
            <button className="btn-primary" form="formPagosVenta" disabled={guardandoPago}>
              {guardandoPago ? "Guardando…" : "Guardar pagos"}
            </button>
          </div>
        }
      >
        {ventaParaPago && (
          <form id="formPagosVenta" onSubmit={onGuardarPagos} className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-surface p-3 text-sm">
              <div>
                <div className="text-xs text-muted">Total</div>
                <div className="font-semibold">{dinero(ventaParaPago.total)}</div>
              </div>
              <div>
                <div className="text-xs text-muted">Saldo pendiente</div>
                <div className="font-semibold text-amber-700">
                  {dinero(Math.max(0, ventaParaPago.total - sumaPagos(ventaParaPago.pagos)))}
                </div>
              </div>
            </div>

            {ventaParaPago.pagos.length > 0 && (
              <div>
                <div className="form-label">Pagos registrados</div>
                <div className="flex flex-col gap-1 text-sm">
                  {ventaParaPago.pagos.map((pago) => (
                    <div key={pago.id} className="flex justify-between rounded-lg bg-surface px-3 py-2">
                      <span>Pago {pago.numero} · {pago.metodo}</span>
                      <strong>{dinero(pago.monto)}</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <EditorPagos
              pagos={pagosNuevos}
              numeroInicial={ventaParaPago.pagos.length}
              onChange={setPagosNuevos}
            />
            <CampoPropina valor={propinaNueva} onChange={setPropinaNueva} />
          </form>
        )}
      </Modal>
    </>
  );
}
