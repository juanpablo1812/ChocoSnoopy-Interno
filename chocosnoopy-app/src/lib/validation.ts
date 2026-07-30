import { z } from "zod";

/**
 * Esquemas de validación (portan las reglas de Validaciones.gs y las
 * validaciones de Productos.gs / Inventario.gs / Ventas.gs al lado del
 * servidor). La base de datos aplica además sus propios CHECK constraints.
 */

const textoRequerido = z.string().trim().min(1, "Este campo es obligatorio.");

export const materiaPrimaSchema = z.object({
  id: z.coerce.number().int().positive().optional().nullable(),
  nombre: textoRequerido,
  unidad: textoRequerido,
  cantidad_presentacion: z.coerce
    .number()
    .positive("La cantidad de presentación debe ser mayor que cero."),
  costo_total_compra: z.coerce
    .number()
    .min(0, "El costo total de compra no puede ser negativo."),
  stock_actual: z.coerce
    .number()
    .min(0, "La cantidad disponible no puede ser negativa."),
  stock_minimo: z.coerce
    .number()
    .min(0, "El nivel mínimo no puede ser negativo."),
  estado: z.enum(["Activo", "Inactivo"]).default("Activo"),
  fecha_ingreso: z.string().optional().nullable(),
});
export type MateriaPrimaInput = z.infer<typeof materiaPrimaSchema>;

export const recetaItemSchema = z.object({
  materia_prima_id: z.coerce.number().int().positive(),
  cantidad: z.coerce.number().positive("Cada cantidad debe ser mayor que cero."),
});

export const componenteProductoSchema = z.object({
  tipo_chocolate: textoRequerido,
  cantidad: z.coerce
    .number()
    .int("La cantidad de chocolates debe ser un número entero.")
    .positive("La cantidad de chocolates debe ser mayor que cero."),
});

export const productoSchema = z.object({
  id: z.coerce.number().int().positive().optional().nullable(),
  nombre: textoRequerido,
  categoria: z.string().trim().default(""),
  tipo_producto: z.enum(["Individual", "Compuesto"]).default("Individual"),
  tipo_chocolate: z.string().trim().default(""),
  precio_venta: z.coerce
    .number()
    .positive("El precio de venta debe ser mayor que cero."),
  estado: z.enum(["Activo", "Inactivo"]).default("Activo"),
  recetas: z.array(recetaItemSchema).default([]),
  componentes: z.array(componenteProductoSchema).default([]),
}).superRefine((datos, ctx) => {
  if (datos.tipo_producto === "Individual" && datos.recetas.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["recetas"], message: "Debes agregar al menos una materia prima a la receta." });
  }
  if (datos.tipo_producto === "Individual" && datos.tipo_chocolate === "") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["tipo_chocolate"], message: "Indica el tipo del chocolate." });
  }
  if (datos.tipo_producto === "Compuesto" && datos.componentes.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["componentes"], message: "Una caja debe incluir al menos un chocolate individual." });
  }
});
export type ProductoInput = z.infer<typeof productoSchema>;

export const ventaProductoSchema = z.object({
  producto_id: z.coerce.number().int().positive(),
  cantidad: z.coerce
    .number()
    .int("La cantidad debe ser un número entero.")
    .positive("La cantidad debe ser mayor que cero."),
  selecciones: z.array(z.object({
    producto_id: z.coerce.number().int().positive(),
    cantidad: z.coerce.number().int().positive(),
  })).default([]),
});

export const metodoPagoSchema = z.enum(["Efectivo", "Transferencia"]);

export const pagoVentaSchema = z.object({
  monto: z.coerce.number().positive("El pago debe ser mayor que cero."),
  metodo: metodoPagoSchema,
});

export const propinaSchema = z.coerce
  .number()
  .min(0, "La propina no puede ser negativa.")
  .default(0);

export const pagosVentaSchema = z.object({
  pagos: z.array(pagoVentaSchema).min(1, "Agrega al menos un pago."),
  propina: propinaSchema,
});

export const ventaSchema = z.object({
  cliente: z.string().trim().default(""),
  whatsapp: z.string().trim().default(""),
  fecha_entrega: textoRequerido,
  estado: z.enum(["Pendiente", "Entregada"]).default("Pendiente"),
  productos: z
    .array(ventaProductoSchema)
    .min(1, "Agrega al menos un producto a la venta."),
  pagos: z.array(pagoVentaSchema).default([]),
  propina: propinaSchema,
});
export type VentaInput = z.infer<typeof ventaSchema>;
