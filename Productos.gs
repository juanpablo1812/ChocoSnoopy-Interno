/**
 * =========================================
 * PRODUCTOS
 * =========================================
 */

function obtenerDatosProductos() {

  return {
    productos: obtenerProductos(),
    materiasPrimas: obtenerMateriasPrimasParaProducto()
  };

}

function obtenerMateriasPrimasParaProducto() {

  return leerObjetos(SHEETS.MATERIAS_PRIMAS)
    .filter(function(item) {
      return String(item.ID || "").trim() !== "" &&
             String(item.Nombre || "").trim() !== "" &&
             String(item.Estado || "Activo").trim() === "Activo";
    })
    .map(function(item) {

      return {
        ID: String(item.ID || "").trim(),
        Nombre: String(item.Nombre || "").trim(),
        Unidad: String(item.Unidad || "").trim(),
        CostoUnitario: Number(item.CostoUnitario || 0),
        StockActual: Number(item.StockActual || 0),
        StockMinimo: Number(item.StockMinimo || 0),
        Estado: String(item.Estado || "Activo").trim()
      };

    })
    .sort(function(a, b) {
      return a.Nombre.localeCompare(b.Nombre, "es");
    });

}

function obtenerMateriasPrimasParaCalculo_() {

  return leerObjetos(SHEETS.MATERIAS_PRIMAS)
    .filter(function(item) {
      return String(item.ID || "").trim() !== "" &&
             String(item.Nombre || "").trim() !== "";
    })
    .map(function(item) {

      return {
        ID: String(item.ID || "").trim(),
        Nombre: String(item.Nombre || "").trim(),
        Unidad: String(item.Unidad || "").trim(),
        CostoUnitario: Number(item.CostoUnitario || 0),
        StockActual: Number(item.StockActual || 0),
        StockMinimo: Number(item.StockMinimo || 0),
        Estado: String(item.Estado || "Activo").trim()
      };

    })
    .sort(function(a, b) {
      return a.Nombre.localeCompare(b.Nombre, "es");
    });

}

function obtenerProductos() {

  const productos = leerObjetos(SHEETS.PRODUCTOS)
    .filter(function(item) {
      return String(item.ID || "").trim() !== "" &&
             String(item.Nombre || "").trim() !== "";
    });

  const materiasPrimas = obtenerMateriasPrimasParaCalculo_();
  const recetas = leerObjetos(SHEETS.RECETAS)
    .filter(function(item) {
      return String(item.ID || "").trim() !== "" &&
             String(item.IDProducto || "").trim() !== "" &&
             String(item.IDMateriaPrima || "").trim() !== "";
    });

  const mapaMaterias = crearMapaMateriasPrimas_(materiasPrimas);

  return productos
    .map(function(item) {

      const recetasProducto = recetas
        .filter(function(receta) {
          return String(receta.IDProducto || "").trim() === String(item.ID || "").trim();
        })
        .map(function(receta) {

          const materia = mapaMaterias.get(String(receta.IDMateriaPrima || "").trim());

          const cantidad = Number(receta.Cantidad || 0);
          const costoUnitario = Number(materia ? materia.CostoUnitario || 0 : 0);

          return {
            ID: String(receta.ID || "").trim(),
            IDProducto: String(receta.IDProducto || "").trim(),
            IDMateriaPrima: String(receta.IDMateriaPrima || "").trim(),
            NombreMateriaPrima: materia ? String(materia.Nombre || "").trim() : String(receta.IDMateriaPrima || "").trim(),
            Unidad: materia ? String(materia.Unidad || "").trim() : "",
            Cantidad: cantidad,
            CostoUnitario: costoUnitario,
            CostoTotal: costoUnitario * cantidad
          };

        })
        .sort(function(a, b) {
          return a.NombreMateriaPrima.localeCompare(b.NombreMateriaPrima, "es");
        });

      return {
        ID: String(item.ID || "").trim(),
        Nombre: String(item.Nombre || "").trim(),
        Categoria: String(item.Categoria || "").trim(),
        PrecioVenta: Number(item.PrecioVenta || 0),
        CostoProduccion: Number(item.CostoProduccion || 0),
        Ganancia: Number(item.Ganancia || 0),
        Estado: String(item.Estado || "Activo").trim(),
        FechaCreacion: serializarFecha(item.FechaCreacion),
        FechaActualizacion: serializarFecha(item.FechaActualizacion),
        Recetas: recetasProducto
      };

    })
    .sort(function(a, b) {
      return a.Nombre.localeCompare(b.Nombre, "es");
    });

}

function obtenerProducto(idProducto) {

  const productos = obtenerProductos();

  return productos.find(function(item) {
    return String(item.ID) === String(idProducto);
  }) || null;

}

function guardarProducto(producto) {

  const idProducto = String(producto.ID || "").trim();
  const nombre = String(producto.Nombre || "").trim();
  const categoria = String(producto.Categoria || "").trim();
  const estado = String(producto.Estado || "Activo").trim() === "Inactivo" ? "Inactivo" : "Activo";
  const precioVenta = Number(producto.PrecioVenta);

  if (!nombre) {
    throw new Error("El nombre del producto es obligatorio.");
  }

  if (!Number.isFinite(precioVenta) || precioVenta <= 0) {
    throw new Error("El precio de venta debe ser mayor que cero.");
  }

  if (existeProductoConNombre_(nombre, idProducto)) {
    throw new Error("Ya existe un producto con ese nombre.");
  }

  const materiasPrimas = obtenerMateriasPrimasParaCalculo_();
  const recetasEntrada = Array.isArray(producto.Recetas) ? producto.Recetas : [];
  const recetas = normalizarRecetasProducto_(recetasEntrada, materiasPrimas);

  if (recetas.length === 0) {
    throw new Error("Debes agregar al menos una materia prima a la receta.");
  }

  const costoProduccion = calcularCostoReceta_(recetas, materiasPrimas);
  const ganancia = precioVenta - costoProduccion;
  const ahora = new Date();

  if (idProducto) {

    const filaProducto = obtenerFilaProductoPorID_(idProducto);

    if (!filaProducto) {
      throw new Error("No existe el producto a actualizar.");
    }

    const fechaCreacion = filaProducto.datos[7] || ahora;

    actualizarFila(SHEETS.PRODUCTOS, filaProducto.fila, [
      idProducto,
      nombre,
      categoria,
      precioVenta,
      costoProduccion,
      ganancia,
      estado,
      fechaCreacion,
      ahora
    ]);

    eliminarRecetasProducto(idProducto);
    guardarRecetasProducto(idProducto, recetas);

    if (typeof registrarHistorial === "function") {
      registrarHistorial("Producto actualizado", `${idProducto} - ${nombre}`);
    }

    return {
      ok: true,
      mensaje: "Producto actualizado correctamente",
      producto: obtenerProducto(idProducto)
    };

  }

  const nuevoID = generarID("P", "SiguienteProducto");

  agregarFila(SHEETS.PRODUCTOS, [
    nuevoID,
    nombre,
    categoria,
    precioVenta,
    costoProduccion,
    ganancia,
    estado,
    ahora,
    ahora
  ]);

  guardarRecetasProducto(nuevoID, recetas);

  if (typeof registrarHistorial === "function") {
    registrarHistorial("Producto creado", `${nuevoID} - ${nombre}`);
  }

  return {
    ok: true,
    mensaje: "Producto guardado correctamente",
    producto: obtenerProducto(nuevoID)
  };

}

function cambiarEstadoProducto(idProducto) {

  const filaProducto = obtenerFilaProductoPorID_(idProducto);

  if (!filaProducto) {
    throw new Error("No existe el producto.");
  }

  const estadoActual = String(filaProducto.datos[6] || "Activo").trim();
  const nuevoEstado = estadoActual.toLowerCase() === "activo" ? "Inactivo" : "Activo";

  actualizarFila(SHEETS.PRODUCTOS, filaProducto.fila, [
    filaProducto.datos[0],
    filaProducto.datos[1],
    filaProducto.datos[2],
    filaProducto.datos[3],
    filaProducto.datos[4],
    filaProducto.datos[5],
    nuevoEstado,
    filaProducto.datos[7],
    new Date()
  ]);

  if (typeof registrarHistorial === "function") {
    registrarHistorial("Estado producto", `${idProducto}: ${estadoActual} → ${nuevoEstado}`);
  }

  return {
    ok: true,
    mensaje: `Producto ${nuevoEstado === "Activo" ? "activado" : "desactivado"}`,
    producto: obtenerProducto(idProducto)
  };

}

function desactivarProducto(idProducto) {

  const filaProducto = obtenerFilaProductoPorID_(idProducto);

  if (!filaProducto) {
    throw new Error("No existe el producto.");
  }

  const estadoActual = String(filaProducto.datos[6] || "Activo").trim();

  if (estadoActual.toLowerCase() === "inactivo") {
    return {
      ok: true,
      mensaje: "El producto ya estaba inactivo",
      producto: obtenerProducto(idProducto)
    };
  }

  actualizarFila(SHEETS.PRODUCTOS, filaProducto.fila, [
    filaProducto.datos[0],
    filaProducto.datos[1],
    filaProducto.datos[2],
    filaProducto.datos[3],
    filaProducto.datos[4],
    filaProducto.datos[5],
    "Inactivo",
    filaProducto.datos[7],
    new Date()
  ]);

  if (typeof registrarHistorial === "function") {
    registrarHistorial("Producto desactivado", `${idProducto} - ${filaProducto.datos[1]}`);
  }

  return {
    ok: true,
    mensaje: "Producto desactivado correctamente",
    producto: obtenerProducto(idProducto)
  };

}

function duplicarProducto(idProducto) {

  const producto = obtenerProducto(idProducto);

  if (!producto) {
    throw new Error("No existe el producto a duplicar.");
  }

  const nombreDuplicado = nombreUnicoDuplicado_(producto.Nombre || "Producto");

  const resultado = guardarProducto({
    Nombre: nombreDuplicado,
    Categoria: producto.Categoria || "",
    PrecioVenta: producto.PrecioVenta || 0,
    Estado: "Activo",
    Recetas: (producto.Recetas || []).map(function(receta) {
      return {
        IDMateriaPrima: receta.IDMateriaPrima,
        Cantidad: receta.Cantidad
      };
    })
  });

  if (typeof registrarHistorial === "function") {
    registrarHistorial("Producto duplicado", `${idProducto} → ${resultado.producto.ID}`);
  }

  return {
    ok: true,
    mensaje: "Producto duplicado correctamente",
    producto: resultado.producto
  };

}

/*====================================
=         HELPERS INTERNOS
====================================*/

function obtenerFilaProductoPorID_(idProducto) {

  const datos = leerDatos(SHEETS.PRODUCTOS);

  for (let i = 1; i < datos.length; i++) {

    if (String(datos[i][0] || "").trim() === String(idProducto || "").trim()) {
      return {
        fila: i + 1,
        datos: datos[i]
      };
    }

  }

  return null;

}

function crearMapaMateriasPrimas_(materiasPrimas) {

  const mapa = new Map();

  materiasPrimas.forEach(function(item) {
    mapa.set(String(item.ID || "").trim(), item);
  });

  return mapa;

}

function calcularCostoReceta_(recetas, materiasPrimas) {

  const mapaMaterias = crearMapaMateriasPrimas_(materiasPrimas);

  return recetas.reduce(function(total, receta) {

    const materia = mapaMaterias.get(String(receta.IDMateriaPrima || "").trim());

    const costoUnitario = Number(materia ? materia.CostoUnitario || 0 : 0);
    const cantidad = Number(receta.Cantidad || 0);

    return total + (costoUnitario * cantidad);

  }, 0);

}

function normalizarRecetasProducto_(recetasEntrada, materiasPrimas) {

  const mapaMaterias = crearMapaMateriasPrimas_(materiasPrimas);
  const agrupadas = new Map();

  recetasEntrada.forEach(function(item) {

    const idMateriaPrima = String(item.IDMateriaPrima || "").trim();
    const cantidad = Number(item.Cantidad);

    if (!idMateriaPrima) {
      return;
    }

    if (!mapaMaterias.has(idMateriaPrima)) {
      throw new Error(`La materia prima ${idMateriaPrima} no existe.`);
    }

    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      throw new Error("Cada cantidad de receta debe ser mayor que cero.");
    }

    agrupadas.set(
      idMateriaPrima,
      (agrupadas.get(idMateriaPrima) || 0) + cantidad
    );

  });

  return Array.from(agrupadas.entries()).map(function(par) {
    return {
      IDMateriaPrima: par[0],
      Cantidad: par[1]
    };
  });

}

function existeProductoConNombre_(nombre, idIgnorar) {

  const objetivo = String(nombre || "").trim().toLowerCase();

  if (!objetivo) {
    return false;
  }

  return leerObjetos(SHEETS.PRODUCTOS).some(function(item) {

    return String(item.Nombre || "").trim().toLowerCase() === objetivo &&
      String(item.ID || "").trim() !== String(idIgnorar || "").trim();

  });

}

function nombreUnicoDuplicado_(nombreBase) {

  const base = String(nombreBase || "Producto").trim();
  let candidato = `${base} (Copia)`;
  let contador = 2;

  while (existeProductoConNombre_(candidato, "")) {
    candidato = `${base} (Copia ${contador})`;
    contador++;
  }

  return candidato;

}