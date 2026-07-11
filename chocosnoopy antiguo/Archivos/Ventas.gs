/**
 * =========================================
 * VENTAS
 * =========================================
 *
 * Las cifras de una venta siempre se calculan en el servidor. Así se evita
 * que un valor modificado en el navegador afecte total, costo o inventario.
 */

function obtenerVentas() {
  return leerObjetos(SHEETS.VENTAS)
    .filter(function(item) { return String(item.ID || "").trim() !== ""; })
    .map(normalizarVenta_)
    .sort(function(a, b) {
      return new Date(b.FechaCreacion) - new Date(a.FechaCreacion);
    });
}

function obtenerVenta(idVenta) {
  return obtenerVentas().find(function(item) {
    return String(item.ID) === String(idVenta);
  }) || null;
}

/** Guarda una venta, sus detalles y la reserva de inventario en una sola operación. */
function guardarVentaCompleta(datos) {
  const bloqueo = LockService.getScriptLock();
  bloqueo.waitLock(30000);

  try {
    const venta = prepararVenta_(datos || {});
    const idVenta = siguienteIdEnHoja_(SHEETS.VENTAS, "V");
    const detalles = venta.productos.map(function(producto, indice) {
      return [
        siguienteIdEnHoja_(SHEETS.DETALLE_VENTAS, "DV", indice),
        idVenta,
        producto.ID,
        producto.Nombre,
        producto.Cantidad,
        producto.PrecioVenta,
        producto.Subtotal
      ];
    });

    // Mantiene compatibles las funciones antiguas que todavía usan los
    // consecutivos de Configuración.
    actualizarConfiguracion("SiguienteVenta", Number(idVenta.slice(1)) + 1);
    if (detalles.length > 0) {
      actualizarConfiguracion("SiguienteDetalleVenta", Number(detalles[detalles.length - 1][0].slice(2)) + 1);
    }

    const ahora = new Date();
    agregarFilas_(SHEETS.VENTAS, [[
      idVenta,
      venta.cliente,
      venta.whatsapp,
      ahora,
      venta.fechaEntrega,
      venta.estado,
      venta.total,
      venta.ganancia,
      venta.productos.length
    ]]);
    agregarFilas_(SHEETS.DETALLE_VENTAS, detalles);
    registrarSalidaInventario_(idVenta, venta.insumos, ahora);

    if (typeof registrarHistorial === "function") {
      registrarHistorial("Venta creada", idVenta + " - " + (venta.cliente || "Consumidor final"));
    }

    return { ok: true, id: idVenta, total: venta.total, ganancia: venta.ganancia };
  } finally {
    bloqueo.releaseLock();
  }
}

/** Cambia el estado. Al cancelar una venta pendiente se libera su inventario reservado. */
function cambiarEstadoVenta(idVenta, estado) {
  const estadosValidos = ["Pendiente", "Entregada", "Cancelada"];
  const nuevoEstado = String(estado || "").trim();

  if (estadosValidos.indexOf(nuevoEstado) === -1) {
    throw new Error("El estado de la venta no es válido.");
  }

  const bloqueo = LockService.getScriptLock();
  bloqueo.waitLock(30000);

  try {
    const fila = obtenerFilaVentaPorID_(idVenta);
    if (!fila) throw new Error("La venta no existe.");

    const estadoAnterior = String(fila.datos[5] || "Pendiente").trim();
    if (estadoAnterior === nuevoEstado) return { ok: true, mensaje: "La venta ya tiene ese estado." };

    if (estadoAnterior === "Cancelada") {
      throw new Error("Una venta cancelada no puede reactivarse. Crea una venta nueva.");
    }

    if (nuevoEstado === "Cancelada" && estadoAnterior !== "Cancelada") {
      liberarInventarioVenta_(idVenta, new Date());
    }

    actualizarFila(SHEETS.VENTAS, fila.fila, [
      fila.datos[0], fila.datos[1], fila.datos[2], fila.datos[3], fila.datos[4],
      nuevoEstado, fila.datos[6], fila.datos[7], fila.datos[8]
    ]);

    if (typeof registrarHistorial === "function") {
      registrarHistorial("Estado venta", idVenta + ": " + estadoAnterior + " → " + nuevoEstado);
    }
    return { ok: true };
  } finally {
    bloqueo.releaseLock();
  }
}

function normalizarVenta_(item) {
  return {
    ID: String(item.ID || ""),
    Cliente: String(item.Cliente || ""),
    Whatsapp: String(item.WhatsApp || item.Whatsapp || ""),
    FechaCreacion: serializarFecha(item.FechaCreacion),
    FechaEntrega: serializarFecha(item.FechaEntrega),
    Estado: String(item.Estado || "Pendiente"),
    Total: Number(item.Total || 0),
    Ganancia: Number(item.Ganancia || 0),
    CantidadProductos: Number(item.CantidadProductos || 0)
  };
}

function obtenerFilaVentaPorID_(idVenta) {
  const datos = leerDatos(SHEETS.VENTAS);
  for (let i = 1; i < datos.length; i++) {
    if (String(datos[i][0] || "").trim() === String(idVenta || "").trim()) {
      return { fila: i + 1, datos: datos[i] };
    }
  }
  return null;
}

function prepararVenta_(datos) {
  const textoFechaEntrega = String(datos.FechaEntrega || "").trim();
  const fechaEntrega = /^\d{4}-\d{2}-\d{2}$/.test(textoFechaEntrega)
    ? new Date(textoFechaEntrega + "T12:00:00")
    : new Date(textoFechaEntrega);
  if (Number.isNaN(fechaEntrega.getTime())) throw new Error("Indica una fecha de entrega válida.");

  const estado = String(datos.Estado || "Pendiente").trim();
  if (["Pendiente", "Entregada"].indexOf(estado) === -1) {
    throw new Error("Una venta nueva debe estar pendiente o entregada.");
  }

  const solicitados = Array.isArray(datos.Productos) ? datos.Productos : [];
  if (solicitados.length === 0) throw new Error("Agrega al menos un producto a la venta.");

  const productosDisponibles = obtenerProductos();
  const porId = new Map(productosDisponibles.map(function(producto) { return [producto.ID, producto]; }));
  const agrupados = new Map();

  solicitados.forEach(function(item) {
    const id = String(item.IDProducto || "").trim();
    const cantidad = Number(item.Cantidad);
    if (!id || !Number.isFinite(cantidad) || cantidad <= 0 || !Number.isInteger(cantidad)) {
      throw new Error("Cada producto debe tener una cantidad entera mayor que cero.");
    }
    agrupados.set(id, (agrupados.get(id) || 0) + cantidad);
  });

  const insumos = new Map();
  const productos = Array.from(agrupados.entries()).map(function(par) {
    const producto = porId.get(par[0]);
    if (!producto || producto.Estado !== "Activo") throw new Error("El producto seleccionado no está disponible.");
    if (!producto.Recetas || producto.Recetas.length === 0) throw new Error("El producto " + producto.Nombre + " no tiene receta.");

    producto.Recetas.forEach(function(receta) {
      const cantidadInsumo = Number(receta.Cantidad) * par[1];
      const actual = insumos.get(receta.IDMateriaPrima) || { ID: receta.IDMateriaPrima, Nombre: receta.NombreMateriaPrima, Unidad: receta.Unidad, Cantidad: 0 };
      actual.Cantidad += cantidadInsumo;
      insumos.set(receta.IDMateriaPrima, actual);
    });

    const precio = Number(producto.PrecioVenta || 0);
    const costo = Number(producto.CostoProduccion || 0);
    return { ID: producto.ID, Nombre: producto.Nombre, Cantidad: par[1], PrecioVenta: precio, Subtotal: precio * par[1], Costo: costo * par[1] };
  });

  const materias = new Map(obtenerMateriasPrimasActivas().map(function(materia) { return [materia.ID, materia]; }));
  insumos.forEach(function(insumo) {
    const materia = materias.get(insumo.ID);
    if (!materia) throw new Error("La materia prima " + insumo.Nombre + " no está activa.");
    if (Number(materia.StockActual) < insumo.Cantidad) {
      throw new Error("Stock insuficiente de " + materia.Nombre + ". Disponible: " + materia.StockActual + " " + materia.Unidad + ".");
    }
  });

  return {
    cliente: String(datos.Cliente || "").trim(),
    whatsapp: String(datos.Whatsapp || "").trim(),
    fechaEntrega: fechaEntrega,
    estado: estado,
    productos: productos,
    insumos: Array.from(insumos.values()),
    total: productos.reduce(function(total, producto) { return total + producto.Subtotal; }, 0),
    ganancia: productos.reduce(function(total, producto) { return total + producto.Subtotal - producto.Costo; }, 0)
  };
}

function registrarSalidaInventario_(idVenta, insumos, fecha) {
  const datos = leerDatos(SHEETS.MATERIAS_PRIMAS);
  const filas = new Map();
  for (let i = 1; i < datos.length; i++) filas.set(String(datos[i][0] || "").trim(), { fila: i + 1, datos: datos[i] });

  const movimientos = insumos.map(function(insumo) {
    const encontrada = filas.get(insumo.ID);
    const fila = encontrada.datos.slice();
    fila[6] = Number(fila[6] || 0) - insumo.Cantidad;
    fila[10] = fecha;
    actualizarFila(SHEETS.MATERIAS_PRIMAS, encontrada.fila, fila);
    return [fecha, insumo.ID, "Salida por venta", -insumo.Cantidad, insumo.Unidad, idVenta, "Reserva de inventario"];
  });
  agregarFilas_(SHEETS.MOVIMIENTOS, movimientos);
}

function liberarInventarioVenta_(idVenta, fecha) {
  const movimientos = leerObjetos(SHEETS.MOVIMIENTOS).filter(function(movimiento) {
    return String(movimiento.Referencia || "") === String(idVenta) && String(movimiento.Tipo || "") === "Salida por venta";
  });
  if (movimientos.length === 0) return;

  const datos = leerDatos(SHEETS.MATERIAS_PRIMAS);
  const filas = new Map();
  for (let i = 1; i < datos.length; i++) filas.set(String(datos[i][0] || "").trim(), { fila: i + 1, datos: datos[i] });

  const reingresos = movimientos.map(function(movimiento) {
    const encontrada = filas.get(String(movimiento.MateriaPrimaID || ""));
    if (!encontrada) throw new Error("No existe la materia prima a liberar.");
    const cantidad = Math.abs(Number(movimiento.Cantidad || 0));
    const fila = encontrada.datos.slice();
    fila[6] = Number(fila[6] || 0) + cantidad;
    fila[10] = fecha;
    actualizarFila(SHEETS.MATERIAS_PRIMAS, encontrada.fila, fila);
    return [fecha, movimiento.MateriaPrimaID, "Reintegro por cancelación", cantidad, movimiento.Unidad, idVenta, "Venta cancelada"];
  });
  agregarFilas_(SHEETS.MOVIMIENTOS, reingresos);
}

function siguienteIdEnHoja_(nombreHoja, prefijo, desplazamiento) {
  const indice = Number(desplazamiento || 0);
  const ids = leerDatos(nombreHoja).slice(1).map(function(fila) { return String(fila[0] || "").trim(); });
  const mayor = ids.reduce(function(maximo, id) {
    const coincidencia = new RegExp("^" + prefijo + "(\\d+)$").exec(id);
    return coincidencia ? Math.max(maximo, Number(coincidencia[1])) : maximo;
  }, 0);
  return prefijo + String(mayor + indice + 1).padStart(4, "0");
}

function agregarFilas_(nombreHoja, filas) {
  if (!filas || filas.length === 0) return;
  const hoja = obtenerHoja(nombreHoja);
  hoja.getRange(hoja.getLastRow() + 1, 1, filas.length, filas[0].length).setValues(filas);
}
