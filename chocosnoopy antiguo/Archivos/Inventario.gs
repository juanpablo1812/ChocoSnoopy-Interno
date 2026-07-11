/**
 * =========================================
 * INVENTARIO
 * =========================================
 */

function obtenerDatosInventario() {

  const materiasPrimas = obtenerMateriasPrimas();

  return {
    materiasPrimas: materiasPrimas,
    alertas: materiasPrimas.filter(function(item) {
      return item.BajoMinimo === true;
    })
  };

}

function obtenerMateriasPrimas() {

  return leerObjetos(SHEETS.MATERIAS_PRIMAS)
    .filter(function(item) {
      return String(item.ID || "").trim() !== "" &&
             String(item.Nombre || "").trim() !== "";
    })
    .map(function(item) {
      return normalizarMateriaPrima_(item);
    })
    .sort(function(a, b) {
      return a.Nombre.localeCompare(b.Nombre, "es");
    });

}

function obtenerMateriasPrimasActivas() {

  return obtenerMateriasPrimas()
    .filter(function(item) {
      return item.Estado === "Activo";
    });

}

function obtenerOpcionesMateriasPrimas() {

  return obtenerMateriasPrimasActivas()
    .map(function(item) {
      return {
        ID: item.ID,
        Nombre: item.Nombre,
        Unidad: item.Unidad,
        CostoUnitario: item.CostoUnitario,
        StockActual: item.StockActual,
        StockMinimo: item.StockMinimo,
        Estado: item.Estado
      };
    });

}

function obtenerMateriaPrimaPorNombre(nombre) {

  const objetivo = String(nombre || "").trim().toLowerCase();

  if (!objetivo) {
    return null;
  }

  return obtenerMateriasPrimas().find(function(item) {
    return String(item.Nombre || "").trim().toLowerCase() === objetivo;
  }) || null;

}

function obtenerMateriaPrima(idMateriaPrima) {

  const materiaPrima = obtenerMateriasPrimas().find(function(item) {
    return String(item.ID) === String(idMateriaPrima);
  });

  return materiaPrima || null;

}

function guardarMateriaPrima(materiaPrima) {

  const idMateriaPrima = String(materiaPrima.ID || "").trim();
  const nombre = String(materiaPrima.Nombre || "").trim();
  const unidad = String(materiaPrima.Unidad || "").trim();
  const estado = String(materiaPrima.Estado || "Activo").trim() === "Inactivo" ? "Inactivo" : "Activo";

  const cantidadPresentacion = Number(materiaPrima.CantidadPresentacion);
  const costoTotalCompra = Number(materiaPrima.CostoTotalCompra);
  const stockMinimo = Number(materiaPrima.StockMinimo);
  const stockActualEntrada = Number(materiaPrima.StockActual);
  const fechaIngreso = parseFechaMateriaPrima_(materiaPrima.FechaIngreso) || new Date();

  if (!nombre) {
    throw new Error("El nombre de la materia prima es obligatorio.");
  }

  if (!unidad) {
    throw new Error("La unidad de la materia prima es obligatoria.");
  }

  if (!Number.isFinite(cantidadPresentacion) || cantidadPresentacion <= 0) {
    throw new Error("La cantidad de presentación debe ser mayor que cero.");
  }

  if (!Number.isFinite(costoTotalCompra) || costoTotalCompra < 0) {
    throw new Error("El costo total de compra debe ser un número mayor o igual a cero.");
  }

  if (!Number.isFinite(stockMinimo) || stockMinimo < 0) {
    throw new Error("El nivel mínimo debe ser un número mayor o igual a cero.");
  }

  const stockActual = Number.isFinite(stockActualEntrada) ? stockActualEntrada : cantidadPresentacion;

  if (stockActual < 0) {
    throw new Error("La cantidad disponible debe ser un número mayor o igual a cero.");
  }

  if (existeMateriaPrimaConNombre_(nombre, idMateriaPrima)) {
    throw new Error("Ya existe una materia prima con ese nombre.");
  }

  const costoUnitarioCalculado = cantidadPresentacion > 0
    ? costoTotalCompra / cantidadPresentacion
    : 0;

  if (idMateriaPrima) {

    const fila = obtenerFilaMateriaPrimaPorID_(idMateriaPrima);

    if (!fila) {
      throw new Error("No existe la materia prima a actualizar.");
    }

    const fechaCreacion = fila.datos[9] || fechaIngreso;
    const fechaActualizacion = new Date();

    actualizarFila(SHEETS.MATERIAS_PRIMAS, fila.fila, [
      idMateriaPrima,
      nombre,
      unidad,
      cantidadPresentacion,
      costoTotalCompra,
      costoUnitarioCalculado,
      stockActual,
      stockMinimo,
      estado,
      fechaCreacion,
      fechaActualizacion
    ]);

    if (typeof registrarHistorial === "function") {
      registrarHistorial("Materia prima actualizada", `${idMateriaPrima} - ${nombre}`);
    }

    return {
      ok: true,
      mensaje: "Materia prima actualizada correctamente",
      materiaPrima: obtenerMateriaPrima(idMateriaPrima)
    };

  }

  const nuevoID = generarID("M", "SiguienteMateriaPrima");
  const fechaActual = new Date();

  agregarFila(SHEETS.MATERIAS_PRIMAS, [
    nuevoID,
    nombre,
    unidad,
    cantidadPresentacion,
    costoTotalCompra,
    costoUnitarioCalculado,
    stockActual,
    stockMinimo,
    estado,
    fechaIngreso,
    fechaActual
  ]);

  if (typeof registrarHistorial === "function") {
    registrarHistorial("Materia prima creada", `${nuevoID} - ${nombre}`);
  }

  return {
    ok: true,
    mensaje: "Materia prima guardada correctamente",
    materiaPrima: obtenerMateriaPrima(nuevoID)
  };

}

function cambiarEstadoMateriaPrima(idMateriaPrima) {

  const fila = obtenerFilaMateriaPrimaPorID_(idMateriaPrima);

  if (!fila) {
    throw new Error("No existe la materia prima.");
  }

  const estadoActual = String(fila.datos[8] || "Activo").trim();
  const nuevoEstado = estadoActual.toLowerCase() === "activo" ? "Inactivo" : "Activo";

  actualizarFila(SHEETS.MATERIAS_PRIMAS, fila.fila, [
    fila.datos[0],
    fila.datos[1],
    fila.datos[2],
    fila.datos[3],
    fila.datos[4],
    fila.datos[5],
    fila.datos[6],
    fila.datos[7],
    nuevoEstado,
    fila.datos[9] || new Date(),
    new Date()
  ]);

  if (typeof registrarHistorial === "function") {
    registrarHistorial("Estado materia prima", `${idMateriaPrima}: ${estadoActual} → ${nuevoEstado}`);
  }

  return {
    ok: true,
    mensaje: `Materia prima ${nuevoEstado === "Activo" ? "activada" : "desactivada"}`,
    materiaPrima: obtenerMateriaPrima(idMateriaPrima)
  };

}

function ajustarStockMateriaPrima(idMateriaPrima, delta) {

  const fila = obtenerFilaMateriaPrimaPorID_(idMateriaPrima);

  if (!fila) {
    throw new Error("No existe la materia prima.");
  }

  const stockActual = Number(fila.datos[6] || 0);
  const cambio = Number(delta || 0);
  const nuevoStock = stockActual + cambio;

  if (nuevoStock < 0) {
    throw new Error("El stock no puede quedar negativo.");
  }

  actualizarFila(SHEETS.MATERIAS_PRIMAS, fila.fila, [
    fila.datos[0],
    fila.datos[1],
    fila.datos[2],
    fila.datos[3],
    fila.datos[4],
    fila.datos[5],
    nuevoStock,
    fila.datos[7],
    fila.datos[8],
    fila.datos[9] || new Date(),
    new Date()
  ]);

  return {
    ok: true,
    mensaje: "Stock actualizado correctamente",
    materiaPrima: obtenerMateriaPrima(idMateriaPrima)
  };

}

/*====================================
=         HELPERS INTERNOS
====================================*/

function normalizarMateriaPrima_(item) {

  const cantidadPresentacion = Number(item.CantidadPresentacion || item.StockActual || 0);
  const stockActual = Number(item.StockActual || cantidadPresentacion || 0);
  const stockMinimo = Number(item.StockMinimo || 0);
  const costoTotalCompra = Number(item.CostoTotalCompra || 0);
  const costoUnitario = Number(item.CostoUnitario || (cantidadPresentacion > 0 ? costoTotalCompra / cantidadPresentacion : 0));
  const estado = String(item.Estado || "Activo").trim();

  return {
    ID: String(item.ID || "").trim(),
    Nombre: String(item.Nombre || "").trim(),
    Unidad: String(item.Unidad || "").trim(),
    CantidadPresentacion: cantidadPresentacion,
    CostoTotalCompra: costoTotalCompra,
    CostoUnitario: costoUnitario,
    StockActual: stockActual,
    StockMinimo: stockMinimo,
    Estado: estado,
    FechaCreacion: serializarFecha(item.FechaCreacion),
    FechaActualizacion: serializarFecha(item.FechaActualizacion),
    BajoMinimo: estado.toLowerCase() === "activo" && stockActual <= stockMinimo
  };

}

function obtenerFilaMateriaPrimaPorID_(idMateriaPrima) {

  const datos = leerDatos(SHEETS.MATERIAS_PRIMAS);

  for (let i = 1; i < datos.length; i++) {

    if (String(datos[i][0] || "").trim() === String(idMateriaPrima || "").trim()) {
      return {
        fila: i + 1,
        datos: datos[i]
      };
    }

  }

  return null;

}

function existeMateriaPrimaConNombre_(nombre, idIgnorar) {

  const objetivo = String(nombre || "").trim().toLowerCase();

  return leerObjetos(SHEETS.MATERIAS_PRIMAS).some(function(item) {
    return String(item.Nombre || "").trim().toLowerCase() === objetivo &&
      String(item.ID || "").trim() !== String(idIgnorar || "").trim();
  });

}

function parseFechaMateriaPrima_(valor) {

  if (!valor) {
    return null;
  }

  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return valor;
  }

  const fecha = new Date(valor);

  if (Number.isNaN(fecha.getTime())) {
    return null;
  }

  return fecha;

}