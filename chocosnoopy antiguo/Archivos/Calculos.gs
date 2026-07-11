/**
 * Verifica si una fecha corresponde al día actual
 */
function esHoy(fecha) {

  const hoy = new Date();
  const f = new Date(fecha);

  return (
    f.getDate() === hoy.getDate() &&
    f.getMonth() === hoy.getMonth() &&
    f.getFullYear() === hoy.getFullYear()
  );

}

/**
 * Verifica si una fecha pertenece al mes actual
 */
function esEsteMes(fecha) {

  const hoy = new Date();
  const f = new Date(fecha);

  return (
    f.getMonth() === hoy.getMonth() &&
    f.getFullYear() === hoy.getFullYear()
  );

}

/**
 * Verifica si una fecha pertenece a la semana actual
 * (lunes a domingo)
 */
function esEstaSemana(fecha) {

  const hoy = new Date();
  const f = new Date(fecha);

  const inicioSemana = new Date(hoy);
  const dia = inicioSemana.getDay();

  const diferencia = dia === 0 ? 6 : dia - 1;

  inicioSemana.setDate(inicioSemana.getDate() - diferencia);
  inicioSemana.setHours(0, 0, 0, 0);

  const finSemana = new Date(inicioSemana);
  finSemana.setDate(finSemana.getDate() + 7);

  return f >= inicioSemana && f < finSemana;

}

/**
 * Retorna únicamente las ventas del día
 */
function filtrarVentasHoy(ventas) {

  return ventas.filter(v => esHoy(v.Fecha));

}

/**
 * Retorna únicamente las ventas de la semana
 */
function filtrarVentasSemana(ventas) {

  return ventas.filter(v => esEstaSemana(v.Fecha));

}

/**
 * Retorna únicamente las ventas del mes
 */
function filtrarVentasMes(ventas) {

  return ventas.filter(v => esEsteMes(v.Fecha));

}

/**
 * Cuenta la cantidad de ventas
 */
function contarVentas(ventas) {

  return ventas.length;

}

/**
 * Suma el valor total de las ventas
 */
function sumarIngresos(ventas) {

  return ventas.reduce((total, venta) => {

    return total + Number(venta.Total || venta.TotalVenta || 0);

  }, 0);

}

/**
 * Suma el costo de las ventas
 */
function sumarCostos(ventas) {

  return ventas.reduce((total, venta) => {

    return total + Number(venta.Costo || venta.CostoVenta || 0);

  }, 0);

}

/**
 * Suma la ganancia obtenida
 */
function sumarGanancias(ventas) {

  return ventas.reduce((total, venta) => {

    return total + Number(venta.Ganancia || venta.GananciaVenta || 0);

  }, 0);

}
