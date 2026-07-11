/**
 * ==========================================
 * CHOCOSNOOPY
 * Punto de entrada
 * ==========================================
 */

function doGet() {

  return HtmlService
    .createTemplateFromFile("index")
    .evaluate()
    .setTitle("Chocosnoopy")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

}


/**
 * Permite importar archivos HTML
 */
function include(nombre) {

  return HtmlService
    .createTemplateFromFile(nombre)
    .evaluate()
    .getContent();

}