/**
 * ========================================
 * DASHBOARD
 * ========================================
 */

function obtenerDashboard() {

  // Las ventas canceladas no representan ingreso ni utilidad.
  const ventas = leerObjetos(SHEETS.VENTAS)
    .map(normalizarVenta_)
    .filter(function(venta) { return venta.Estado !== "Cancelada"; });
  const materiasPrimas = leerObjetos(SHEETS.MATERIAS_PRIMAS);

  const ventasHoy = filtrarVentasHoy(ventas);
  const ventasSemana = filtrarVentasSemana(ventas);
  const ventasMes = filtrarVentasMes(ventas);

  return {

    config: obtenerConfiguracionDashboard(),

    hoy: obtenerResumen(ventasHoy),

    semana: obtenerResumen(ventasSemana),

    mes: obtenerResumen(ventasMes),

    alertas: obtenerAlertasInventario(materiasPrimas)

  };

}

/**
 * Obtiene la configuración general del Dashboard
 */
function obtenerConfiguracionDashboard() {

  return {

      nombreNegocio: obtenerConfiguracion("NombreNegocio", "Chocosnoopy"),

      moneda: obtenerConfiguracion("Moneda", "COP"),

      simbolo: obtenerConfiguracion("SimboloMoneda", "$"),

      logo: obtenerConfiguracion("Logo", "")

  };

}

/**
 * Resumen del día actual
 */
/**
 * Obtiene el resumen de un conjunto de ventas
 */
function obtenerResumen(ventas){

    return{

        ventas: contarVentas(ventas),

        ingresos: sumarIngresos(ventas),

        ganancia: sumarGanancias(ventas)

    };

}


/**
 * Obtiene las materias primas con stock bajo
 */
function obtenerAlertasInventario(materiasPrimas){

    return materiasPrimas
        .filter(item => Number(item.StockActual) <= Number(item.StockMinimo))
        .map(item => ({

            nombre: item.Nombre,

            stock: item.StockActual,

            unidad: item.Unidad

        }));

}
