/**
 * ========================================
 * VISTAS
 * ========================================
 */

function obtenerVista(nombreVista) {

  return HtmlService
    .createTemplateFromFile(nombreVista)
    .evaluate()
    .getContent();

}