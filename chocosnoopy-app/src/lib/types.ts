/**
 * Tipos del modelo de datos (equivalen a las tablas de Supabase).
 */

export type Estado = "Activo" | "Inactivo";
export type EstadoVenta = "Pendiente" | "Entregada" | "Cancelada";
export type MetodoPago = "Efectivo" | "Transferencia";

export interface MateriaPrima {
  id: number;
  nombre: string;
  unidad: string;
  cantidad_presentacion: number;
  costo_total_compra: number;
  costo_unitario: number;
  stock_actual: number;
  stock_minimo: number;
  estado: Estado;
  fecha_ingreso: string;
  created_at: string;
  updated_at: string;
}

/** Materia prima con la marca calculada de stock bajo mínimo. */
export interface MateriaPrimaConAlerta extends MateriaPrima {
  bajo_minimo: boolean;
}

export interface RecetaItem {
  id?: number;
  materia_prima_id: number;
  nombre_materia_prima?: string;
  unidad?: string;
  cantidad: number;
  costo_unitario?: number;
  costo_total?: number;
}

export interface Producto {
  id: number;
  nombre: string;
  categoria: string;
  precio_venta: number;
  costo_produccion: number;
  ganancia: number;
  estado: Estado;
  created_at: string;
  updated_at: string;
  recetas: RecetaItem[];
}

export interface Venta {
  id: number;
  cliente: string;
  whatsapp: string;
  fecha_creacion: string;
  fecha_entrega: string | null;
  estado: EstadoVenta;
  total: number;
  ganancia: number;
  cantidad_productos: number;
  created_at: string;
  pagos: PagoVenta[];
  propinas: PropinaVenta[];
}

/** Abono registrado para una venta. */
export interface PagoVenta {
  id: number;
  venta_id: number;
  numero: number;
  monto: number;
  metodo: MetodoPago;
  fecha: string;
  created_at: string;
}

/** Propina recibida junto con un pago de la venta. */
export interface PropinaVenta {
  id: number;
  venta_id: number;
  monto: number;
  fecha: string;
  created_at: string;
}

export interface DetalleVenta {
  id: number;
  venta_id: number;
  producto_id: number;
  nombre_producto: string;
  cantidad: number;
  precio_venta: number;
  subtotal: number;
}

export interface ResumenVentas {
  pagos: number;
  ingresos: number;
  ganancia: number;
}

export interface AlertaInventario {
  nombre: string;
  stock: number;
  unidad: string;
}

export interface DashboardData {
  hoy: ResumenVentas;
  semana: ResumenVentas;
  mes: ResumenVentas;
  alertas: AlertaInventario[];
}

/** Respuesta estándar de las Server Actions. */
export type Resultado<T = unknown> =
  | { ok: true; mensaje?: string; data?: T }
  | { ok: false; error: string };
