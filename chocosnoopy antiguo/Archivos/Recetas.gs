/**
 * =========================================
 * RECETAS
 * =========================================
 */

function obtenerRecetasProducto(idProducto) {

  const recetas = leerObjetos(SHEETS.RECETAS)
    .filter(function(item) {
      return String(item.IDProducto || "").trim() === String(idProducto || "").trim();
    });

  const materiasPrimas = leerObjetos(SHEETS.MATERIAS_PRIMAS);
  const mapaMaterias = crearMapaMateriasPrimasRecetas_(materiasPrimas);

  return recetas
    .map(function(item) {

      const materia = mapaMaterias.get(String(item.IDMateriaPrima || "").trim());

      const cantidad = Number(item.Cantidad || 0);
      const costoUnitario = Number(materia ? materia.CostoUnitario || 0 : 0);

      return {
        ID: String(item.ID || "").trim(),
        IDProducto: String(item.IDProducto || "").trim(),
        IDMateriaPrima: String(item.IDMateriaPrima || "").trim(),
        NombreMateriaPrima: materia ? String(materia.Nombre || "").trim() : String(item.IDMateriaPrima || "").trim(),
        Unidad: materia ? String(materia.Unidad || "").trim() : "",
        Cantidad: cantidad,
        CostoUnitario: costoUnitario,
        CostoTotal: costoUnitario * cantidad
      };

    })
    .sort(function(a, b) {
      return a.NombreMateriaPrima.localeCompare(b.NombreMateriaPrima, "es");
    });

}

function guardarRecetasProducto(idProducto, recetas) {

  const recetasValidas = Array.isArray(recetas) ? recetas : [];

  eliminarRecetasProducto(idProducto);

  recetasValidas.forEach(function(item) {

    const idReceta = generarID("R", "SiguienteReceta");

    agregarFila(SHEETS.RECETAS, [
      idReceta,
      idProducto,
      item.IDMateriaPrima,
      Number(item.Cantidad || 0)
    ]);

  });

}

function eliminarRecetasProducto(idProducto) {

  const hoja = obtenerHoja(SHEETS.RECETAS);
  const datos = hoja.getDataRange().getValues();

  for (let i = datos.length - 1; i >= 1; i--) {

    if (String(datos[i][1] || "").trim() === String(idProducto || "").trim()) {
      hoja.deleteRow(i + 1);
    }

  }

}

/*====================================
=         HELPERS INTERNOS
====================================*/

function crearMapaMateriasPrimasRecetas_(materiasPrimas) {

  const mapa = new Map();

  materiasPrimas.forEach(function(item) {
    mapa.set(String(item.ID || "").trim(), item);
  });

  return mapa;

}