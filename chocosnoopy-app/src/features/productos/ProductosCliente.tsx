"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import { useToast } from "@/components/Toast";
import { normalizarTipoChocolate } from "@/lib/chocolates";
import { cantidad, dinero } from "@/lib/format";
import type { MateriaPrima, Producto, TipoProducto } from "@/lib/types";
import { cambiarEstadoProducto, duplicarProducto, guardarProducto } from "./actions";

interface Props {
  productos: Producto[];
  materiasPrimas: MateriaPrima[];
}

interface FilaReceta {
  materia_prima_id: string;
  cantidad: string;
}

interface FilaComponente {
  tipo_chocolate: string;
  cantidad: string;
}

interface FormProducto {
  id: number | null;
  nombre: string;
  categoria: string;
  tipo_producto: TipoProducto;
  tipo_chocolate: string;
  precio_venta: string;
  estado: "Activo" | "Inactivo";
}

const FORM_VACIO: FormProducto = {
  id: null,
  nombre: "",
  categoria: "",
  tipo_producto: "Individual",
  tipo_chocolate: "",
  precio_venta: "",
  estado: "Activo",
};

function etiquetaTipo(tipo: TipoProducto) {
  return tipo === "Compuesto" ? "Caja" : "Chocolate";
}

export default function ProductosCliente({ productos, materiasPrimas }: Props) {
  const router = useRouter();
  const { mostrar } = useToast();
  const [pendiente, iniciarTransicion] = useTransition();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [form, setForm] = useState<FormProducto>(FORM_VACIO);
  const [filas, setFilas] = useState<FilaReceta[]>([]);
  const [componentes, setComponentes] = useState<FilaComponente[]>([]);
  const [guardando, setGuardando] = useState(false);

  const mapaMaterias = useMemo(
    () => new Map(materiasPrimas.map((mp) => [mp.id, mp])),
    [materiasPrimas],
  );

  const chocolates = useMemo(
    () => productos.filter((p) => p.tipo_producto === "Individual"),
    [productos],
  );

  const tiposDisponibles = useMemo(() => {
    const porTipo = new Map<string, string>();
    chocolates.forEach((p) => {
      const normalizado = normalizarTipoChocolate(p.tipo_chocolate);
      if (normalizado && !porTipo.has(normalizado)) porTipo.set(normalizado, p.tipo_chocolate.trim());
    });
    return [...porTipo.entries()]
      .map(([normalizado, etiqueta]) => ({ normalizado, etiqueta }))
      .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, "es"));
  }, [chocolates]);

  const costoPromedioPorTipo = useMemo(() => {
    const acumulados = new Map<string, { total: number; cantidad: number }>();
    chocolates.forEach((p) => {
      const tipo = normalizarTipoChocolate(p.tipo_chocolate);
      const actual = acumulados.get(tipo) ?? { total: 0, cantidad: 0 };
      actual.total += p.costo_produccion;
      actual.cantidad += 1;
      acumulados.set(tipo, actual);
    });
    return new Map(
      [...acumulados].map(([tipo, valor]) => [tipo, valor.total / valor.cantidad]),
    );
  }, [chocolates]);

  const costoInsumos = useMemo(
    () =>
      filas.reduce((total, fila) => {
        const materia = mapaMaterias.get(Number(fila.materia_prima_id));
        return total + (materia ? Number(materia.costo_unitario) * Number(fila.cantidad || 0) : 0);
      }, 0),
    [filas, mapaMaterias],
  );

  const costoChocolates = useMemo(
    () =>
      componentes.reduce((total, componente) => {
        const costoPromedio =
          costoPromedioPorTipo.get(normalizarTipoChocolate(componente.tipo_chocolate)) ?? 0;
        return total + costoPromedio * Number(componente.cantidad || 0);
      }, 0),
    [componentes, costoPromedioPorTipo],
  );

  const costoProduccion =
    costoInsumos + (form.tipo_producto === "Compuesto" ? costoChocolates : 0);
  const gananciaPreview = Number(form.precio_venta || 0) - costoProduccion;
  const cantidadCaja = componentes.reduce(
    (total, componente) => total + Number(componente.cantidad || 0),
    0,
  );

  function abrirNuevo(tipo_producto: TipoProducto) {
    setForm({ ...FORM_VACIO, tipo_producto });
    setFilas(tipo_producto === "Individual" ? [{ materia_prima_id: "", cantidad: "" }] : []);
    setComponentes(
      tipo_producto === "Compuesto" ? [{ tipo_chocolate: "", cantidad: "1" }] : [],
    );
    setModalAbierto(true);
  }

  function abrirEdicion(producto: Producto) {
    setForm({
      id: producto.id,
      nombre: producto.nombre,
      categoria: producto.categoria,
      tipo_producto: producto.tipo_producto,
      tipo_chocolate: producto.tipo_chocolate,
      precio_venta: String(producto.precio_venta),
      estado: producto.estado,
    });
    setFilas(
      producto.recetas.map((receta) => ({
        materia_prima_id: String(receta.materia_prima_id),
        cantidad: String(receta.cantidad),
      })),
    );
    setComponentes(
      producto.componentes.map((componente) => ({
        tipo_chocolate: componente.tipo_chocolate,
        cantidad: String(componente.cantidad),
      })),
    );
    setModalAbierto(true);
  }

  function cambiarTipo(tipo_producto: TipoProducto) {
    setForm({ ...form, tipo_producto, tipo_chocolate: tipo_producto === "Individual" ? form.tipo_chocolate : "" });
    if (tipo_producto === "Individual" && filas.length === 0) {
      setFilas([{ materia_prima_id: "", cantidad: "" }]);
    }
    if (tipo_producto === "Compuesto" && componentes.length === 0) {
      setComponentes([{ tipo_chocolate: "", cantidad: "1" }]);
    }
  }

  function editarFila(indice: number, campo: keyof FilaReceta, valor: string) {
    setFilas(filas.map((fila, i) => (i === indice ? { ...fila, [campo]: valor } : fila)));
  }

  function editarComponente(indice: number, campo: keyof FilaComponente, valor: string) {
    setComponentes(
      componentes.map((componente, i) =>
        i === indice ? { ...componente, [campo]: valor } : componente,
      ),
    );
  }

  async function onGuardar(evento: React.FormEvent) {
    evento.preventDefault();
    if (guardando) return;

    const recetas = filas
      .filter((fila) => fila.materia_prima_id && Number(fila.cantidad) > 0)
      .map((fila) => ({
        materia_prima_id: Number(fila.materia_prima_id),
        cantidad: Number(fila.cantidad),
      }));
    const tiposCaja = componentes
      .filter((componente) => componente.tipo_chocolate.trim() && Number(componente.cantidad) > 0)
      .map((componente) => ({
        tipo_chocolate: componente.tipo_chocolate.trim(),
        cantidad: Number(componente.cantidad),
      }));

    if (form.tipo_producto === "Individual" && !form.tipo_chocolate.trim()) {
      mostrar("Indica el tipo del chocolate, por ejemplo ChocoSnoopy o ChocoRelleno.", "error");
      return;
    }
    if (form.tipo_producto === "Individual" && recetas.length === 0) {
      mostrar("Agrega al menos una materia prima al chocolate.", "error");
      return;
    }
    if (form.tipo_producto === "Compuesto" && tiposCaja.length === 0) {
      mostrar("Agrega al menos un tipo de chocolate a la caja.", "error");
      return;
    }
    const tiposNormalizados = tiposCaja.map((componente) =>
      normalizarTipoChocolate(componente.tipo_chocolate),
    );
    if (new Set(tiposNormalizados).size !== tiposNormalizados.length) {
      mostrar("No repitas un tipo; ajusta su cantidad en una sola línea.", "error");
      return;
    }

    setGuardando(true);
    const resultado = await guardarProducto({
      ...form,
      tipo_chocolate: form.tipo_producto === "Individual" ? form.tipo_chocolate.trim() : "",
      recetas,
      componentes: tiposCaja,
    });
    setGuardando(false);

    if (resultado.ok) {
      mostrar(resultado.mensaje ?? "Guardado.", "success");
      setModalAbierto(false);
      router.refresh();
    } else {
      mostrar(resultado.error, "error");
    }
  }

  function onToggle(producto: Producto) {
    iniciarTransicion(async () => {
      const resultado = await cambiarEstadoProducto(producto.id);
      if (resultado.ok) {
        mostrar(resultado.mensaje ?? "Actualizado.", "success");
        router.refresh();
      } else {
        mostrar(resultado.error, "error");
      }
    });
  }

  function onDuplicar(producto: Producto) {
    iniciarTransicion(async () => {
      const resultado = await duplicarProducto(producto.id);
      if (resultado.ok) {
        mostrar(resultado.mensaje ?? "Duplicado.", "success");
        router.refresh();
      } else {
        mostrar(resultado.error, "error");
      }
    });
  }

  return (
    <>
      <PageHeader
        titulo="Productos"
        subtitulo={`${productos.length} productos`}
        accion={
          <div className="flex gap-2">
            <button className="btn-secondary text-sm" onClick={() => abrirNuevo("Individual")}>
              <span className="material-symbols-outlined text-lg">add</span>
              Chocolate
            </button>
            <button className="btn-primary text-sm" onClick={() => abrirNuevo("Compuesto")}>
              <span className="material-symbols-outlined text-lg">inventory_2</span>
              Caja
            </button>
          </div>
        }
      />

      {materiasPrimas.length === 0 && (
        <div className="mb-4 rounded-xl2 border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Primero registra materias primas en <strong>Inventario</strong> para crear recetas.
        </div>
      )}

      {productos.length === 0 ? (
        <EmptyState
          icono="inventory_2"
          titulo="No hay productos"
          descripcion="Crea primero un chocolate individual y luego las cajas de ejemplo."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {productos.map((producto) => (
            <article key={producto.id} className="card">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{producto.nombre}</h3>
                    <span
                      className={
                        producto.tipo_producto === "Compuesto"
                          ? "status-pill status-warning"
                          : "status-pill status-success"
                      }
                    >
                      {etiquetaTipo(producto.tipo_producto)}
                    </span>
                    {producto.estado === "Inactivo" && (
                      <span className="status-pill status-muted">Inactivo</span>
                    )}
                  </div>
                  {producto.tipo_producto === "Individual" && (
                    <p className="text-xs text-muted">Tipo: {producto.tipo_chocolate}</p>
                  )}
                  {producto.categoria && <p className="text-xs text-muted">{producto.categoria}</p>}
                </div>
                <button
                  className="btn-ghost !px-2"
                  onClick={() => abrirEdicion(producto)}
                  aria-label="Editar"
                >
                  <span className="material-symbols-outlined text-xl">edit</span>
                </button>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
                <div><div className="text-xs text-muted">Precio</div><div className="font-semibold">{dinero(producto.precio_venta)}</div></div>
                <div><div className="text-xs text-muted">Costo</div><div className="font-semibold">{dinero(producto.costo_produccion)}</div></div>
                <div><div className="text-xs text-muted">Ganancia</div><div className="font-semibold text-green-600">{dinero(producto.ganancia)}</div></div>
              </div>

              {producto.tipo_producto === "Compuesto" && (
                <p className="mt-2 text-xs text-muted">
                  Caja de {producto.componentes.reduce((total, componente) => total + componente.cantidad, 0)}:{" "}
                  {producto.componentes
                    .map((componente) => `${cantidad(componente.cantidad)} × ${componente.tipo_chocolate}`)
                    .join(", ")}
                </p>
              )}
              {producto.recetas.length > 0 && (
                <p className="mt-2 text-xs text-muted">
                  {producto.tipo_producto === "Compuesto" ? "Insumos de la caja" : "Receta"}:{" "}
                  {producto.recetas
                    .map(
                      (receta) =>
                        `${receta.nombre_materia_prima} (${cantidad(receta.cantidad)} ${receta.unidad})`,
                    )
                    .join(", ")}
                </p>
              )}

              <div className="mt-3 flex items-center justify-end gap-1">
                <button className="btn-ghost text-sm" disabled={pendiente} onClick={() => onDuplicar(producto)}>
                  Duplicar
                </button>
                <button className="btn-ghost text-sm" disabled={pendiente} onClick={() => onToggle(producto)}>
                  {producto.estado === "Activo" ? "Desactivar" : "Activar"}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <datalist id="tipos-chocolate">
        {tiposDisponibles.map((tipo) => <option key={tipo.normalizado} value={tipo.etiqueta} />)}
      </datalist>

      <Modal
        abierto={modalAbierto}
        titulo={
          form.id
            ? `Editar ${etiquetaTipo(form.tipo_producto).toLowerCase()}`
            : `Nueva ${etiquetaTipo(form.tipo_producto).toLowerCase()}`
        }
        onCerrar={() => setModalAbierto(false)}
        footer={
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm">
              <span className="text-muted">
                {form.tipo_producto === "Compuesto" ? "Ganancia estimada: " : "Ganancia: "}
              </span>
              <strong className={gananciaPreview >= 0 ? "text-green-600" : "text-rose-600"}>
                {dinero(gananciaPreview)}
              </strong>
            </div>
            <div className="flex gap-2">
              <button className="btn-ghost" onClick={() => setModalAbierto(false)}>Cancelar</button>
              <button className="btn-primary" form="formProducto" disabled={guardando}>
                {guardando ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        }
      >
        <form id="formProducto" onSubmit={onGuardar} className="flex flex-col gap-3">
          <div>
            <label className="form-label">Tipo de producto</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={form.tipo_producto === "Individual" ? "btn-primary" : "btn-secondary"} onClick={() => cambiarTipo("Individual")}>
                Chocolate individual
              </button>
              <button type="button" className={form.tipo_producto === "Compuesto" ? "btn-primary" : "btn-secondary"} onClick={() => cambiarTipo("Compuesto")}>
                Caja de ejemplo
              </button>
            </div>
          </div>

          <div>
            <label className="form-label">Nombre</label>
            <input className="form-control" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required />
          </div>

          {form.tipo_producto === "Individual" && (
            <div>
              <label className="form-label">Tipo de chocolate</label>
              <input
                className="form-control"
                list="tipos-chocolate"
                placeholder="Ej. ChocoSnoopy"
                value={form.tipo_chocolate}
                onChange={(e) => setForm({ ...form, tipo_chocolate: e.target.value })}
                required
              />
              <p className="mt-1 text-xs text-muted">
                “Choco Snoopy”, “chocosnoopy” y “CHOCOSNOOPY” se consideran el mismo tipo.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Categoría</label>
              <input className="form-control" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} />
            </div>
            <div>
              <label className="form-label">Precio de venta</label>
              <input className="form-control" type="number" step="any" min="0" value={form.precio_venta} onChange={(e) => setForm({ ...form, precio_venta: e.target.value })} required />
            </div>
          </div>

          {form.tipo_producto === "Compuesto" && (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="form-label !mb-0">Composición por tipo</label>
                <span className="text-xs text-muted">{cantidadCaja} chocolates · costo estimado {dinero(costoChocolates)}</span>
              </div>
              {tiposDisponibles.length === 0 && (
                <p className="mb-2 text-xs text-amber-700">
                  Asigna un tipo a un chocolate individual antes de crear una caja.
                </p>
              )}
              <div className="flex flex-col gap-2">
                {componentes.map((componente, indice) => (
                  <div key={indice} className="flex items-center gap-2">
                    <select
                      className="form-select flex-1"
                      value={componente.tipo_chocolate}
                      onChange={(e) => editarComponente(indice, "tipo_chocolate", e.target.value)}
                    >
                      <option value="">Tipo de chocolate…</option>
                      {tiposDisponibles.map((tipo) => (
                        <option key={tipo.normalizado} value={tipo.etiqueta}>{tipo.etiqueta}</option>
                      ))}
                    </select>
                    <input
                      className="form-control w-20"
                      type="number"
                      min="1"
                      step="1"
                      aria-label="Cantidad"
                      value={componente.cantidad}
                      onChange={(e) => editarComponente(indice, "cantidad", e.target.value)}
                    />
                    <button type="button" className="btn-ghost !px-2" onClick={() => setComponentes(componentes.filter((_, i) => i !== indice))} aria-label="Quitar tipo">
                      <span className="material-symbols-outlined text-xl">delete</span>
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" className="btn-secondary mt-2 text-sm" onClick={() => setComponentes([...componentes, { tipo_chocolate: "", cantidad: "1" }])}>
                <span className="material-symbols-outlined text-lg">add</span>
                Agregar otro tipo
              </button>
            </div>
          )}

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="form-label !mb-0">
                {form.tipo_producto === "Compuesto" ? "Insumos propios de la caja (opcional)" : "Receta"}
              </label>
              <span className="text-xs text-muted">Costo: {dinero(costoInsumos)}</span>
            </div>
            <div className="flex flex-col gap-2">
              {filas.map((fila, indice) => (
                <div key={indice} className="flex items-center gap-2">
                  <select className="form-select flex-1" value={fila.materia_prima_id} onChange={(e) => editarFila(indice, "materia_prima_id", e.target.value)}>
                    <option value="">Materia prima…</option>
                    {materiasPrimas.map((materia) => <option key={materia.id} value={materia.id}>{materia.nombre} ({materia.unidad})</option>)}
                  </select>
                  <input className="form-control w-24" type="number" step="any" min="0" placeholder="Cant." value={fila.cantidad} onChange={(e) => editarFila(indice, "cantidad", e.target.value)} />
                  <button type="button" className="btn-ghost !px-2" onClick={() => setFilas(filas.filter((_, i) => i !== indice))} aria-label="Quitar materia prima">
                    <span className="material-symbols-outlined text-xl">delete</span>
                  </button>
                </div>
              ))}
            </div>
            <button type="button" className="btn-secondary mt-2 text-sm" onClick={() => setFilas([...filas, { materia_prima_id: "", cantidad: "" }])}>
              <span className="material-symbols-outlined text-lg">add</span>
              Agregar materia prima
            </button>
          </div>

          <div>
            <label className="form-label">Estado</label>
            <select className="form-select" value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value as "Activo" | "Inactivo" })}>
              <option value="Activo">Activo</option>
              <option value="Inactivo">Inactivo</option>
            </select>
          </div>
        </form>
      </Modal>
    </>
  );
}
