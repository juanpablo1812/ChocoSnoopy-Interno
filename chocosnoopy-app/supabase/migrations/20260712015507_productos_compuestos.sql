-- ===========================================================================
-- CHOCOSNOOPY · Productos compuestos (cajas y chocolates; versión remota 20260712015507)
-- ===========================================================================
-- Los productos existentes quedan como "Individual". Una caja conserva su
-- receta propia (caja, sticker, bolsa...) y añade productos individuales por
-- medio de productos_componentes.

alter table public.productos
  add column if not exists tipo_producto text not null default 'Individual'
    check (tipo_producto in ('Individual', 'Compuesto'));

create table if not exists public.productos_componentes (
  id                      bigint generated always as identity primary key,
  producto_compuesto_id   bigint not null references public.productos(id) on delete cascade,
  producto_componente_id  bigint not null references public.productos(id) on delete restrict,
  cantidad                integer not null check (cantidad > 0),
  unique (producto_compuesto_id, producto_componente_id),
  check (producto_compuesto_id <> producto_componente_id)
);

create index if not exists productos_componentes_compuesto_idx
  on public.productos_componentes (producto_compuesto_id);
create index if not exists productos_componentes_componente_idx
  on public.productos_componentes (producto_componente_id);

alter table public.productos_componentes enable row level security;

-- Recalcula todos los costos desde las recetas actuales. Las cajas solo
-- admiten productos individuales como componentes, por lo que una pasada es
-- suficiente y no hay recursión de costos.
create or replace function public.recalcular_costos_productos()
returns void
language plpgsql
set search_path = public
as $$
begin
  update public.productos p
  set costo_produccion = coalesce((
        select sum(mp.costo_unitario * r.cantidad)
        from public.recetas r
        join public.materias_primas mp on mp.id = r.materia_prima_id
        where r.producto_id = p.id
      ), 0),
      ganancia = p.precio_venta - coalesce((
        select sum(mp.costo_unitario * r.cantidad)
        from public.recetas r
        join public.materias_primas mp on mp.id = r.materia_prima_id
        where r.producto_id = p.id
      ), 0)
  where p.tipo_producto = 'Individual';

  update public.productos p
  set costo_produccion =
        coalesce((
          select sum(mp.costo_unitario * r.cantidad)
          from public.recetas r
          join public.materias_primas mp on mp.id = r.materia_prima_id
          where r.producto_id = p.id
        ), 0)
        + coalesce((
          select sum(hijo.costo_produccion * pc.cantidad)
          from public.productos_componentes pc
          join public.productos hijo on hijo.id = pc.producto_componente_id
          where pc.producto_compuesto_id = p.id
        ), 0),
      ganancia = p.precio_venta - (
        coalesce((
          select sum(mp.costo_unitario * r.cantidad)
          from public.recetas r
          join public.materias_primas mp on mp.id = r.materia_prima_id
          where r.producto_id = p.id
        ), 0)
        + coalesce((
          select sum(hijo.costo_produccion * pc.cantidad)
          from public.productos_componentes pc
          join public.productos hijo on hijo.id = pc.producto_componente_id
          where pc.producto_compuesto_id = p.id
        ), 0)
      )
  where p.tipo_producto = 'Compuesto';
end;
$$;

-- Si cambia el costo de un insumo, se actualizan de inmediato chocolates y
-- cajas. El trigger no reacciona a cambios de stock.
create or replace function public.recalcular_costos_por_cambio_insumo()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.costo_unitario is distinct from old.costo_unitario then
    perform public.recalcular_costos_productos();
  end if;
  return new;
end;
$$;

drop trigger if exists materias_primas_recalcular_costos on public.materias_primas;
create trigger materias_primas_recalcular_costos
  after update of costo_unitario on public.materias_primas
  for each row execute function public.recalcular_costos_por_cambio_insumo();

-- ---------------------------------------------------------------------------
-- guardar_producto(payload)
-- payload incluye tipo_producto y, para una caja, componentes:
-- [{ producto_id, cantidad }]. Las recetas continúan siendo los insumos
-- directos del producto (por ejemplo caja, bolsa o sticker).
-- ---------------------------------------------------------------------------
create or replace function public.guardar_producto(payload jsonb)
returns public.productos
language plpgsql
set search_path = public
as $$
declare
  v_id        bigint := nullif(payload->>'id', '')::bigint;
  v_nombre    text := btrim(coalesce(payload->>'nombre', ''));
  v_categoria text := btrim(coalesce(payload->>'categoria', ''));
  v_tipo      text := case when btrim(coalesce(payload->>'tipo_producto', 'Individual')) = 'Compuesto'
                            then 'Compuesto' else 'Individual' end;
  v_estado    text := case when btrim(coalesce(payload->>'estado', 'Activo')) = 'Inactivo'
                            then 'Inactivo' else 'Activo' end;
  v_precio    numeric;
  v_producto  public.productos;
begin
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
  if exists (select 1 from public.productos where lower(btrim(nombre)) = lower(v_nombre)
             and id is distinct from v_id) then
    raise exception 'Ya existe un producto con ese nombre.';
  end if;

  create temporary table _rec on commit drop as
  select (elem->>'materia_prima_id')::bigint as materia_prima_id,
         sum((elem->>'cantidad')::numeric) as cantidad
  from jsonb_array_elements(coalesce(payload->'recetas', '[]'::jsonb)) elem
  where coalesce(elem->>'materia_prima_id', '') <> ''
  group by 1;

  if exists (select 1 from _rec where cantidad is null or cantidad <= 0) then
    raise exception 'Cada cantidad de receta debe ser mayor que cero.';
  end if;
  if exists (select 1 from _rec r left join public.materias_primas mp on mp.id = r.materia_prima_id
             where mp.id is null) then
    raise exception 'Una materia prima de la receta no existe.';
  end if;

  create temporary table _comp on commit drop as
  select (elem->>'producto_id')::bigint as producto_id,
         sum((elem->>'cantidad')::numeric) as cantidad
  from jsonb_array_elements(coalesce(payload->'componentes', '[]'::jsonb)) elem
  where coalesce(elem->>'producto_id', '') <> ''
  group by 1;

  if v_tipo = 'Individual' and not exists (select 1 from _rec) then
    raise exception 'Debes agregar al menos una materia prima a la receta del chocolate.';
  end if;
  if v_tipo = 'Compuesto' and not exists (select 1 from _comp) then
    raise exception 'Una caja debe incluir al menos un chocolate individual.';
  end if;
  if exists (select 1 from _comp where cantidad is null or cantidad <= 0 or cantidad <> floor(cantidad)) then
    raise exception 'La cantidad de cada chocolate debe ser un entero mayor que cero.';
  end if;
  if exists (
    select 1 from _comp c left join public.productos p on p.id = c.producto_id
    where p.id is null or p.tipo_producto <> 'Individual'
  ) then
    raise exception 'Cada componente de una caja debe ser un chocolate individual existente.';
  end if;
  if v_id is not null and exists (select 1 from _comp where producto_id = v_id) then
    raise exception 'Una caja no puede incluirse a sí misma.';
  end if;
  if v_tipo = 'Compuesto' and v_id is not null and exists (
    select 1 from public.productos_componentes where producto_componente_id = v_id
  ) then
    raise exception 'No puedes convertir en caja un chocolate que ya forma parte de otra caja.';
  end if;

  if v_id is not null then
    update public.productos
    set nombre = v_nombre, categoria = v_categoria, tipo_producto = v_tipo,
        precio_venta = v_precio, estado = v_estado
    where id = v_id
    returning * into v_producto;
    if v_producto.id is null then
      raise exception 'No existe el producto a actualizar.';
    end if;
    delete from public.recetas where producto_id = v_id;
    delete from public.productos_componentes where producto_compuesto_id = v_id;
  else
    insert into public.productos (nombre, categoria, tipo_producto, precio_venta, estado)
    values (v_nombre, v_categoria, v_tipo, v_precio, v_estado)
    returning * into v_producto;
  end if;

  insert into public.recetas (producto_id, materia_prima_id, cantidad)
  select v_producto.id, materia_prima_id, cantidad from _rec;

  insert into public.productos_componentes (producto_compuesto_id, producto_componente_id, cantidad)
  select v_producto.id, producto_id, cantidad::integer from _comp;

  perform public.recalcular_costos_productos();
  select * into v_producto from public.productos where id = v_producto.id;

  insert into public.historial (accion, detalle)
  values (case when v_id is null then 'Producto creado' else 'Producto actualizado' end,
          v_producto.id || ' - ' || v_nombre || ' (' || lower(v_tipo) || ')');
  return v_producto;
end;
$$;

-- ---------------------------------------------------------------------------
-- crear_venta(payload)
-- Conserva los pagos iniciales. Para una caja, expande sus chocolates y sus
-- insumos propios antes de bloquear y descontar inventario.
-- ---------------------------------------------------------------------------
create or replace function public.crear_venta(payload jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_cliente text := btrim(coalesce(payload->>'cliente', ''));
  v_whatsapp text := btrim(coalesce(payload->>'whatsapp', ''));
  v_estado text := btrim(coalesce(payload->>'estado', 'Pendiente'));
  v_fecha_entrega date;
  v_venta_id bigint;
  v_total numeric(14,2) := 0;
  v_ganancia numeric(14,2) := 0;
  v_cant int := 0;
  v_pagado numeric(14,2) := 0;
  m record;
begin
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

  create temporary table _sol on commit drop as
  select (elem->>'producto_id')::bigint as producto_id,
         sum((elem->>'cantidad')::numeric) as cantidad
  from jsonb_array_elements(coalesce(payload->'productos', '[]'::jsonb)) elem
  where coalesce(elem->>'producto_id', '') <> '' group by 1;
  if not exists (select 1 from _sol) then raise exception 'Agrega al menos un producto a la venta.'; end if;
  if exists (select 1 from _sol where cantidad is null or cantidad <= 0 or cantidad <> floor(cantidad)) then
    raise exception 'Cada producto debe tener una cantidad entera mayor que cero.';
  end if;
  if exists (select 1 from _sol s left join public.productos p on p.id = s.producto_id
             where p.id is null or p.estado <> 'Activo') then
    raise exception 'El producto seleccionado no está disponible.';
  end if;
  if exists (
    select 1 from _sol s join public.productos p on p.id = s.producto_id
    where (p.tipo_producto = 'Individual' and not exists (select 1 from public.recetas r where r.producto_id = p.id))
       or (p.tipo_producto = 'Compuesto' and not exists (select 1 from public.productos_componentes pc where pc.producto_compuesto_id = p.id))
  ) then
    raise exception 'Hay un producto incompleto en la venta.';
  end if;

  select coalesce(sum(p.precio_venta * s.cantidad), 0),
         coalesce(sum((p.precio_venta - p.costo_produccion) * s.cantidad), 0), count(*)
  into v_total, v_ganancia, v_cant from _sol s join public.productos p on p.id = s.producto_id;

  create temporary table _pagos on commit drop as
  select ord::integer as orden, (elem->>'monto')::numeric(14,2) as monto,
         btrim(coalesce(elem->>'metodo', '')) as metodo
  from jsonb_array_elements(coalesce(payload->'pagos', '[]'::jsonb)) with ordinality as p(elem, ord);
  if exists (select 1 from _pagos where monto is null or monto <= 0) then raise exception 'Cada pago debe ser mayor que cero.'; end if;
  if exists (select 1 from _pagos where metodo not in ('Efectivo', 'Transferencia')) then raise exception 'El medio de pago debe ser efectivo o transferencia.'; end if;
  select coalesce(sum(monto), 0) into v_pagado from _pagos;
  if v_pagado > v_total then raise exception 'Los pagos no pueden superar el total de la venta.'; end if;

  insert into public.ventas (cliente, whatsapp, fecha_entrega, estado, total, ganancia, cantidad_productos)
  values (v_cliente, v_whatsapp, v_fecha_entrega, v_estado, v_total, v_ganancia, v_cant)
  returning id into v_venta_id;
  insert into public.detalle_ventas (venta_id, producto_id, nombre_producto, cantidad, precio_venta, subtotal)
  select v_venta_id, p.id, p.nombre, s.cantidad::int, p.precio_venta, p.precio_venta * s.cantidad
  from _sol s join public.productos p on p.id = s.producto_id;
  insert into public.pagos_ventas (venta_id, numero, monto, metodo)
  select v_venta_id, orden, monto, metodo from _pagos order by orden;

  for m in
    select necesarios.materia_prima_id, sum(necesarios.cantidad) as requerido
    from (
      select r.materia_prima_id, r.cantidad * s.cantidad as cantidad
      from _sol s join public.recetas r on r.producto_id = s.producto_id
      union all
      select r.materia_prima_id, r.cantidad * pc.cantidad * s.cantidad as cantidad
      from _sol s
      join public.productos_componentes pc on pc.producto_compuesto_id = s.producto_id
      join public.recetas r on r.producto_id = pc.producto_componente_id
    ) necesarios
    group by necesarios.materia_prima_id
    order by necesarios.materia_prima_id
  loop
    declare v_mp public.materias_primas;
    begin
      select * into v_mp from public.materias_primas where id = m.materia_prima_id for update;
      if v_mp.estado <> 'Activo' then raise exception 'La materia prima % no está activa.', v_mp.nombre; end if;
      if v_mp.stock_actual < m.requerido then
        raise exception 'Stock insuficiente de %. Disponible: % %.', v_mp.nombre, v_mp.stock_actual, v_mp.unidad;
      end if;
      update public.materias_primas set stock_actual = stock_actual - m.requerido where id = m.materia_prima_id;
      insert into public.movimientos_inventario (materia_prima_id, tipo, cantidad, unidad, referencia, nota)
      values (m.materia_prima_id, 'Salida por venta', -m.requerido, v_mp.unidad, v_venta_id::text, 'Reserva de inventario');
    end;
  end loop;
  insert into public.historial (accion, detalle)
  values ('Venta creada', v_venta_id || ' - ' || coalesce(nullif(v_cliente, ''), 'Consumidor final'));
  return jsonb_build_object('ok', true, 'id', v_venta_id, 'total', v_total, 'ganancia', v_ganancia, 'pagado', v_pagado);
end;
$$;

-- La cancelación reintegra desde los movimientos ya expandidos por la venta;
-- se mantienen los bloqueos de filas para evitar carreras con otros ajustes.
create or replace function public.cambiar_estado_venta(p_id bigint, p_estado text)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_nuevo text := btrim(coalesce(p_estado, ''));
  v_anterior text;
  mov record;
begin
  if v_nuevo not in ('Pendiente', 'Entregada', 'Cancelada') then raise exception 'El estado de la venta no es válido.'; end if;
  select estado into v_anterior from public.ventas where id = p_id for update;
  if v_anterior is null then raise exception 'La venta no existe.'; end if;
  if v_anterior = v_nuevo then return jsonb_build_object('ok', true, 'mensaje', 'La venta ya tiene ese estado.'); end if;
  if v_anterior = 'Cancelada' then raise exception 'Una venta cancelada no puede reactivarse. Crea una venta nueva.'; end if;
  if v_nuevo = 'Cancelada' then
    for mov in select materia_prima_id, abs(cantidad) as cantidad, unidad
               from public.movimientos_inventario where referencia = p_id::text and tipo = 'Salida por venta'
               order by materia_prima_id
    loop
      perform 1 from public.materias_primas where id = mov.materia_prima_id for update;
      update public.materias_primas set stock_actual = stock_actual + mov.cantidad where id = mov.materia_prima_id;
      insert into public.movimientos_inventario (materia_prima_id, tipo, cantidad, unidad, referencia, nota)
      values (mov.materia_prima_id, 'Reintegro por cancelación', mov.cantidad, mov.unidad, p_id::text, 'Venta cancelada');
    end loop;
  end if;
  update public.ventas set estado = v_nuevo where id = p_id;
  insert into public.historial (accion, detalle) values ('Estado venta', p_id || ': ' || v_anterior || ' -> ' || v_nuevo);
  return jsonb_build_object('ok', true);
end;
$$;

select public.recalcular_costos_productos();
