/**
 * Verifica si un texto está vacío
 */
function esTextoVacio(valor){

    return valor === null ||
           valor === undefined ||
           String(valor).trim() === "";

}

/**
 * Verifica longitud mínima
 */
function longitudMinima(texto,minimo){

    return String(texto).trim().length >= minimo;

}

/**
 * Verifica si es un número
 */
function esNumero(valor){

    return !isNaN(valor);

}

/**
 * Verifica si un número es positivo
 */
function esPositivo(valor){

    return Number(valor) > 0;

}

function esNoNegativo(valor){

    return Number(valor) >= 0;

}

/**
 * Verifica si una fecha es válida
 */
function esFechaValida(fecha){

    return fecha instanceof Date &&
           !isNaN(fecha);

}

/**
 * Valida el formato de un ID
 */
function validarID(id,prefijo){

    const patron =
        new RegExp("^"+prefijo+"\\d{4}$");

    return patron.test(id);

}

/**
 * Crea una respuesta de validación estándar
 */
function respuestaValidacion(valido, mensaje = "") {

  return {

    valido: valido,

    mensaje: mensaje

  };

}