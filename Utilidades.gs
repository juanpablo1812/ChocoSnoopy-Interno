/**
 * ==========================================
 * CHOCOSNOOPY
 * UTILIDADES
 * ==========================================
 */

/**
 * Retorna el Spreadsheet activo
 */
function obtenerLibro() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * Retorna una hoja por su nombre
 */
function obtenerHoja(nombreHoja) {

  const hoja = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName(nombreHoja);

  if (!hoja) {

    const disponibles = SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheets()
      .map(h => h.getName())
      .join(", ");

    throw new Error(
      `No existe la hoja "${nombreHoja}". Hojas disponibles: ${disponibles}`
    );

  }

  return hoja;

}

/**
 * Obtiene todos los datos de una hoja
 */
function leerDatos(nombreHoja) {

  const hoja = obtenerHoja(nombreHoja);

  return hoja
    .getDataRange()
    .getValues();

}

/**
 * Devuelve únicamente las filas de datos
 * (sin encabezados)
 */
function leerFilas(nombreHoja) {

  const datos = leerDatos(nombreHoja);

  if (datos.length <= 1) {
    return [];
  }

  return datos.slice(1);

}

/**
 * Convierte una hoja en un arreglo de objetos.
 *
 * Primera fila = encabezados
 */

function leerObjetos(nombreHoja){

    const datos = leerDatos(nombreHoja);

    if(datos.length <= 1){
        return [];
    }

    const encabezados = datos[0]
        .map(function(titulo){
            return String(titulo || "").trim();
        });

    const columnas = encabezados
        .map(function(titulo, indice){
            return {
                titulo: titulo,
                indice: indice
            };
        })
        .filter(function(columna){
            return columna.titulo !== "";
        });

    return datos
        .slice(1)
        .filter(function(fila){
            return fila.some(function(valor){
                return valor !== "" &&
                       valor !== null &&
                       valor !== undefined;
            });
        })
        .map(function(fila){

            const objeto = {};

            columnas.forEach(function(columna){
                objeto[columna.titulo] = fila[columna.indice];
            });

            return objeto;

        });

}

/**
 * Agrega una fila al final
 */

function agregarFila(nombreHoja, datos){

    obtenerHoja(nombreHoja)
        .appendRow(datos);

}

/**
 * Actualiza una fila completa
 */

function actualizarFila(nombreHoja, fila, datos){

    obtenerHoja(nombreHoja)
        .getRange(fila,1,1,datos.length)
        .setValues([datos]);

}

/**
 * Busca un registro por ID
 */

function buscarPorId(nombreHoja,id){

    const registros=leerObjetos(nombreHoja);

    return registros.find(registro=>registro.ID===id);

}

/**
 * Genera IDs consecutivos
 *
 * Ej:
 * P001
 * M004
 * V021
 */

/**
 * Genera un ID consecutivo usando la hoja Configuración
 */
function generarID(prefijo, claveConfiguracion) {
  let consecutivo;

  try {
    consecutivo = Number(obtenerConfiguracion(claveConfiguracion));
  } catch (error) {
    // Algunas versiones antiguas de la hoja no tienen todos los consecutivos.
    // Se recupera el siguiente valor desde los IDs ya guardados y se deja
    // creada la configuración para que el problema no se repita.
    const hojasPorPrefijo = {
      P: SHEETS.PRODUCTOS,
      M: SHEETS.MATERIAS_PRIMAS,
      R: SHEETS.RECETAS,
      V: SHEETS.VENTAS,
      DV: SHEETS.DETALLE_VENTAS
    };
    const hoja = hojasPorPrefijo[prefijo];

    if (!hoja) {
      throw error;
    }

    consecutivo = obtenerSiguienteConsecutivo_(hoja, prefijo);
    actualizarConfiguracion(claveConfiguracion, consecutivo + 1);
    return prefijo + String(consecutivo).padStart(4, "0");
  }

  if (!Number.isInteger(consecutivo) || consecutivo < 1) {
    throw new Error("El consecutivo de " + claveConfiguracion + " no es válido.");
  }

  const nuevoID = prefijo + String(consecutivo).padStart(4, "0");

  actualizarConfiguracion(claveConfiguracion, consecutivo + 1);

  return nuevoID;

}

function obtenerSiguienteConsecutivo_(nombreHoja, prefijo) {
  const expresion = new RegExp("^" + prefijo + "(\\d+)$");

  return leerDatos(nombreHoja)
    .slice(1)
    .reduce(function(mayor, fila) {
      const coincidencia = expresion.exec(String(fila[0] || "").trim());
      return coincidencia ? Math.max(mayor, Number(coincidencia[1])) : mayor;
    }, 0) + 1;
}

/**
 * Obtiene el valor de una configuración
 */
/**
 * Obtiene el valor de una configuración.
 * Si no existe, devuelve el valor por defecto (si fue enviado).
 */
function obtenerConfiguracion(clave, valorPorDefecto = null) {

  const configuraciones = leerObjetos(SHEETS.CONFIGURACION);

  const registro = configuraciones.find(item => item.Clave === clave);

  if (!registro) {

    if (valorPorDefecto !== null) {
      return valorPorDefecto;
    }

    throw new Error("No existe la configuración: " + clave);

  }

  return registro.Valor;

}

/**
 * Actualiza el valor de una configuración
 */
/**
 * Actualiza una configuración.
 * Si la clave no existe, la crea automáticamente.
 */
function actualizarConfiguracion(clave, nuevoValor) {

  const hoja = obtenerHoja(SHEETS.CONFIGURACION);

  const datos = hoja.getDataRange().getValues();

  for (let i = 1; i < datos.length; i++) {

    if (datos[i][0] == clave) {

      hoja.getRange(i + 1, 2).setValue(nuevoValor);

      return;

    }

  }

  hoja.appendRow([clave, nuevoValor]);

}

/**
 * Verifica si existe un registro por ID
 */
function existeID(nombreHoja, id) {

  return buscarPorId(nombreHoja, id) !== undefined;

}
function eliminarFila(nombreHoja, numeroFila){

    obtenerHoja(nombreHoja)
        .deleteRow(numeroFila);

}

function hoy(){

    return new Date();

}

function formatoMoneda(valor){

    return "$"+Number(valor).toLocaleString("es-CO");

}

function registrarHistorial(accion, detalle){

    agregarFila(

        SHEETS.HISTORIAL,

        [

            new Date(),

            accion,

            detalle

        ]

    );

}

function ultimaFila(nombreHoja){

    return obtenerHoja(nombreHoja)
        .getLastRow();

}

function ultimaColumna(nombreHoja){

    return obtenerHoja(nombreHoja)
        .getLastColumn();

}

function serializarFecha(valor) {

  if (!valor) {
    return "";
  }

  const fecha = valor instanceof Date ? valor : new Date(valor);

  if (isNaN(fecha.getTime())) {
    return "";
  }

  return Utilities.formatDate(
    fecha,
    Session.getScriptTimeZone(),
    "yyyy-MM-dd'T'HH:mm:ss"
  );

}
