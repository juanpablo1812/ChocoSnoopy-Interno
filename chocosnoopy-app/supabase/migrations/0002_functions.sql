-- ==========================================================================
-- CHOCOSNOOPY  ·  Lógica de negocio
-- Migración 0002 — Funciones PL/pgSQL (transaccionales)
-- ==========================================================================
-- Portan la lógica que en el proyecto original vivía en Ventas.gs y
-- Productos.gs. Al ejecutarse dentro de una transacción de Postgres, los
-- cálculos y el descuento de inventario son atómicos: o se aplica todo o no
-- se aplica nada. Esto sustituye al LockService de Apps Script.
-- ==========================================================================


-- --------------------------------------------------------------------------
-- guardar_producto(payload)
-- Crea o actualiza un producto junto con su receta. Calcula el costo de
-- producción a partir de las materias primas y la ganancia (precio - costo).
--
-- payload = {
--   id: number|null,
--   nombre: string,
--   categoria: string,
--   precio_venta: number,
--   estado: 'Activo'|'Inactivo',
--   recetas: [{ materia_prima_id: number, cantidad: number }, ...]
-- }
-- --------------------------------------------------------------------------
create or replace function public.guardar_producto(payload jsonb)
returns public.productos
language plpgsql
as $$
declare
  v_id        bigint := nullif(payload->>'id', '')::bigint;
  v_nombre    text   := btrim(coalesce(payload->>'nombre', ''));
  v_categoria text   := btrim(coalesce(payload->>'categoria', ''));
  v_estado    text   := case when btrim(coalesce(payload->>'estado', 'Activo')) = 'Inactivo'
                             then 'Inactivo' else 'Activo' end;
  v_precio    numeric;
  v_costo     numeric := 0;
  v_producto  public.productos;
begin
  -- Validaciones básicas
  if v_nombre = '' then
    raise exception 'El nombre del producto es obligatorio.';
  end if;

  begin
    v_precio := (payload->>'precio_venta')::numeric;
  exception when others then
    v_precio := null;
  end;
  if v_precio is null or v_precio <= 0 then
    raise exception 'El precio de venta debe ser mayor que cero.';
  end if;

  if exists (
    select 1 from public.productos
    where lower(btrim(nombre)) = lower(v_nombre)
      and id is distinct from v_id
  ) then
    raise exception 'Ya existe un producto con ese nombre.';
  end if;

  -- Receta normalizada (agrupa materias repetidas)
  create temporary table _rec on commit drop as
  select (elem->>'materia_prima_id')::bigint as materia_prima_id,
         sum((elem->>'cantidad')::numeric)   as cantidad
  from jsonb_array_elements(coalesce(payload->'recetas', '[]'::jsonb)) as elem
  where coalesce(elem->>'materia_prima_id', '') <> ''
  group by 1;

  if not exists (select 1 from _rec) then
    raise exception 'Debes agregar al menos una materia prima a la receta.';
  end if;

  if exists (select 1 from _rec where cantidad is null or cantidad <= 0) then
    raise exception 'Cada cantidad de receta debe ser mayor que cero.';
  end if;

  if exists (
    select 1 from _rec r
    left join public.materias_primas mp on mp.id = r.materia_prima_id
    where mp.id is null
  ) then
    raise exception 'Una materia prima de la receta no existe.';
  end if;

  -- Costo de producción = suma(costo_unitario * cantidad)
  select coalesce(sum(mp.costo_unitario * r.cantidad), 0)
  into v_costo
  from _rec r
  join public.materias_primas mp on mp.id = r.materia_prima_id;

  if v_id is not null then
    -- Actualizar
    update public.productos
    set nombre = v_nombre,
        categoria = v_categoria,
        precio_venta = v_precio,
        costo_produccion = v_costo,
        ganancia = v_precio - v_costo,
        estado = v_estado
    where id = v_id
    returning * into v_producto;

    if v_producto.id is null then
      raise exception 'No existe el producto a actualizar.';
    end if;

    delete from public.recetas where producto_id = v_id;
  else
    -- Crear
    insert into public.productos (nombre, categoria, precio_venta, costo_produccion, ganancia, estado)
    values (v_nombre, v_categoria, v_precio, v_costo, v_precio - v_costo, v_estado)
    returning * into v_producto;
  end if;

  insert into public.recetas (producto_id, materia_prima_id, cantidad)
  select v_producto.id, r.materia_prima_id, r.cantidad
  from _rec r;

  insert into public.historial (accion, detalle)
  values (case when v_id is null then 'Producto creado' else 'Producto actualizado' end,
          v_producto.id || ' - ' || v_nombre);

  return v_producto;
end;
$$;


-- --------------------------------------------------------------------------
-- crear_venta(payload)
-- Registra una venta completa: cabecera, líneas de detalle y la salida de
-- inventario correspondiente según la receta de cada producto. Verifica que
-- haya stock suficiente antes de aplicar nada.
--
-- payload = {
--   cliente: string, whatsapp: string,
--   fecha_entrega: 'YYYY-MM-DD',
--   estado: 'Pendiente'|'Entregada',
--   productos: [{ producto_id: number, cantidad: number }, ...]
-- }
-- --------------------------------------------------------------------------
create or replace function public.crear_venta(payload jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_cliente       text := btrim(coalesce(payload->>'cliente', ''));
  v_whatsapp      text := btrim(coalesce(payload->>'whatsapp', ''));
  v_estado        text := btrim(coalesce(payload->>'estado', 'Pendiente'));
  v_fecha_entrega date;
  v_venta_id      bigint;
  v_total         numeric(14,2) := 0;
  v_ganancia      numeric(14,2) := 0;
  v_cant          int := 0;
  m               record;
begin
  -- Validaciones de cabecera
  if v_estado not in ('Pendiente', 'Entregada') then
    raise exception 'Una venta nueva debe estar pendiente o entregada.';
  end if;

  begin
    v_fecha_entrega := (payload->>'fecha_entrega')::date;
  exception when others then
    raise exception 'Indica una fecha de entrega válida.';
  end;
  if v_fecha_entrega is null then
    raise exception 'Indica una fecha de entrega válida.';
  end if;

  -- Productos solicitados, agrupados por id (suma cantidades repetidas)
  create temporary table _sol on commit drop as
  select (elem->>'producto_id')::bigint as producto_id,
         sum((elem->>'cantidad')::numeric) as cantidad
  from jsonb_array_elements(coalesce(payload->'productos', '[]'::jsonb)) as elem
  where coalesce(elem->>'producto_id', '') <> ''
  group by 1;

  if not exists (select 1 from _sol) then
    raise exception 'Agrega al menos un producto a la venta.';
  end if;

  if exists (
    select 1 from _sol
    where cantidad is null or cantidad <= 0 or cantidad <> floor(cantidad)
  ) then
    raise exception 'Cada producto debe tener una cantidad entera mayor que cero.';
  end if;

  -- Todos los productos deben existir y estar activos
  if exists (
    select 1 from _sol s
    left join public.productos p on p.id = s.producto_id
    where p.id is null or p.estado <> 'Activo'
  ) then
    raise exception 'El producto seleccionado no está disponible.';
  end if;

  -- Todos los productos deben tener receta
  if exists (
    select 1 from _sol s
    where not exists (select 1 from public.recetas r where r.producto_id = s.producto_id)
  ) then
    raise exception 'Hay un producto sin receta en la venta.';
  end if;

  -- Totales (no requiere bloqueo; solo lectura de precios/costos)
  select coalesce(sum(p.precio_venta * s.cantidad), 0),
         coalesce(sum((p.precio_venta - p.costo_produccion) * s.cantidad), 0),
         count(*)
  into v_total, v_ganancia, v_cant
  from _sol s
  join public.productos p on p.id = s.producto_id;

  -- Cabecera de la venta (se crea primero para disponer del id de referencia)
  insert into public.ventas
    (cliente, whatsapp, fecha_entrega, estado, total, ganancia, cantidad_productos)
  values
    (v_cliente, v_whatsapp, v_fecha_entrega, v_estado, v_total, v_ganancia, v_cant)
  returning id into v_venta_id;

  -- Líneas de detalle
  insert into public.detalle_ventas
    (venta_id, producto_id, nombre_producto, cantidad, precio_venta, subtotal)
  select v_venta_id, p.id, p.nombre, s.cantidad::int, p.precio_venta, p.precio_venta * s.cantidad
  from _sol s
  join public.productos p on p.id = s.producto_id;

  -- Insumos requeridos (materia prima -> cantidad total) y verificación de stock.
  -- Se bloquean las filas de materias primas para evitar condiciones de carrera.
  for m in
    select r.materia_prima_id,
           sum(r.cantidad * s.cantidad) as requerido
    from _sol s
    join public.recetas r on r.producto_id = s.producto_id
    group by r.materia_prima_id
  loop
    declare
      v_mp public.materias_primas;
    begin
      select * into v_mp from public.materias_primas
      where id = m.materia_prima_id
      for update;

      if v_mp.estado <> 'Activo' then
        raise exception 'La materia prima % no está activa.', v_mp.nombre;
      end if;
      if v_mp.stock_actual < m.requerido then
        raise exception 'Stock insuficiente de %. Disponible: % %.',
          v_mp.nombre, v_mp.stock_actual, v_mp.unidad;
      end if;

      update public.materias_primas
      set stock_actual = stock_actual - m.requerido
      where id = m.materia_prima_id;

      insert into public.movimientos_inventario
        (materia_prima_id, tipo, cantidad, unidad, referencia, nota)
      values
        (m.materia_prima_id, 'Salida por venta', -m.requerido, v_mp.unidad, v_venta_id::text, 'Reserva de inventario');
    end;
  end loop;

  insert into public.historial (accion, detalle)
  values ('Venta creada', v_venta_id || ' - ' || coalesce(nullif(v_cliente, ''), 'Consumidor final'));

  return jsonb_build_object('ok', true, 'id', v_venta_id, 'total', v_total, 'ganancia', v_ganancia);
end;
$$;


-- --------------------------------------------------------------------------
-- cambiar_estado_venta(id, nuevo_estado)
-- Cambia el estado de una venta. Al cancelar una venta que no estaba
-- cancelada, reintegra al inventario las materias primas reservadas.
-- --------------------------------------------------------------------------
create or replace function public.cambiar_estado_venta(p_id bigint, p_estado text)
returns jsonb
language plpgsql
as $$
declare
  v_nuevo    text := btrim(coalesce(p_estado, ''));
  v_anterior text;
  mov        record;
begin
  if v_nuevo not in ('Pendiente', 'Entregada', 'Cancelada') then
    raise exception 'El estado de la venta no es válido.';
  end if;

  select estado into v_anterior from public.ventas where id = p_id for update;
  if v_anterior is null then
    raise exception 'La venta no existe.';
  end if;

  if v_anterior = v_nuevo then
    return jsonb_build_object('ok', true, 'mensaje', 'La venta ya tiene ese estado.');
  end if;

  if v_anterior = 'Cancelada' then
    raise exception 'Una venta cancelada no puede reactivarse. Crea una venta nueva.';
  end if;

  -- Reintegrar inventario al cancelar
  if v_nuevo = 'Cancelada' then
    for mov in
      select materia_prima_id, abs(cantidad) as cantidad, unidad
      from public.movimientos_inventario
      where referencia = p_id::text and tipo = 'Salida por venta'
    loop
      update public.materias_primas
      set stock_actual = stock_actual + mov.cantidad
      where id = mov.materia_prima_id;

      insert into public.movimientos_inventario
        (materia_prima_id, tipo, cantidad, unidad, referencia, nota)
      values
        (mov.materia_prima_id, 'Reintegro por cancelación', mov.cantidad, mov.unidad, p_id::text, 'Venta cancelada');
    end loop;
  end if;

  update public.ventas set estado = v_nuevo where id = p_id;

  insert into public.historial (accion, detalle)
  values ('Estado venta', p_id || ': ' || v_anterior || ' -> ' || v_nuevo);

  return jsonb_build_object('ok', true);
end;
$$;
