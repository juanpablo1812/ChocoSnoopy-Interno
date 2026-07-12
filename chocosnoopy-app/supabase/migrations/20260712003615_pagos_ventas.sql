-- ===========================================================================
-- Historial de pagos por venta
-- ===========================================================================

create table public.pagos_ventas (
  id         bigint generated always as identity primary key,
  venta_id   bigint not null references public.ventas(id) on delete cascade,
  numero     integer not null check (numero > 0),
  monto      numeric(14,2) not null check (monto > 0),
  metodo     text not null check (metodo in ('Efectivo', 'Transferencia')),
  fecha      timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (venta_id, numero)
);

-- Se consulta el historial por venta y los pagos por fecha en Inicio.
create index pagos_ventas_venta_idx on public.pagos_ventas (venta_id);
create index pagos_ventas_fecha_idx on public.pagos_ventas (fecha);

alter table public.pagos_ventas enable row level security;

-- ---------------------------------------------------------------------------
-- crear_venta(payload)
-- Añade pagos iniciales opcionales a la creación transaccional de la venta.
-- ---------------------------------------------------------------------------
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
  v_pagado        numeric(14,2) := 0;
  m               record;
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
  if exists (
    select 1 from _sol s
    left join public.productos p on p.id = s.producto_id
    where p.id is null or p.estado <> 'Activo'
  ) then
    raise exception 'El producto seleccionado no está disponible.';
  end if;
  if exists (
    select 1 from _sol s
    where not exists (select 1 from public.recetas r where r.producto_id = s.producto_id)
  ) then
    raise exception 'Hay un producto sin receta en la venta.';
  end if;

  select coalesce(sum(p.precio_venta * s.cantidad), 0),
         coalesce(sum((p.precio_venta - p.costo_produccion) * s.cantidad), 0),
         count(*)
  into v_total, v_ganancia, v_cant
  from _sol s
  join public.productos p on p.id = s.producto_id;

  create temporary table _pagos on commit drop as
  select ord::integer as orden,
         (elem->>'monto')::numeric(14,2) as monto,
         btrim(coalesce(elem->>'metodo', '')) as metodo
  from jsonb_array_elements(coalesce(payload->'pagos', '[]'::jsonb)) with ordinality as p(elem, ord);

  if exists (select 1 from _pagos where monto is null or monto <= 0) then
    raise exception 'Cada pago debe ser mayor que cero.';
  end if;
  if exists (select 1 from _pagos where metodo not in ('Efectivo', 'Transferencia')) then
    raise exception 'El medio de pago debe ser efectivo o transferencia.';
  end if;
  select coalesce(sum(monto), 0) into v_pagado from _pagos;
  if v_pagado > v_total then
    raise exception 'Los pagos no pueden superar el total de la venta.';
  end if;

  insert into public.ventas
    (cliente, whatsapp, fecha_entrega, estado, total, ganancia, cantidad_productos)
  values
    (v_cliente, v_whatsapp, v_fecha_entrega, v_estado, v_total, v_ganancia, v_cant)
  returning id into v_venta_id;

  insert into public.detalle_ventas
    (venta_id, producto_id, nombre_producto, cantidad, precio_venta, subtotal)
  select v_venta_id, p.id, p.nombre, s.cantidad::int, p.precio_venta, p.precio_venta * s.cantidad
  from _sol s
  join public.productos p on p.id = s.producto_id;

  insert into public.pagos_ventas (venta_id, numero, monto, metodo)
  select v_venta_id, orden, monto, metodo
  from _pagos
  order by orden;

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

  return jsonb_build_object('ok', true, 'id', v_venta_id, 'total', v_total, 'ganancia', v_ganancia, 'pagado', v_pagado);
end;
$$;

-- ---------------------------------------------------------------------------
-- agregar_pagos_venta(id, pagos)
-- Registra nuevos abonos sin modificar los ya guardados y evita sobrepagos.
-- ---------------------------------------------------------------------------
create or replace function public.agregar_pagos_venta(p_id bigint, p_pagos jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_total    numeric(14,2);
  v_estado   text;
  v_pagado   numeric(14,2);
  v_nuevo    numeric(14,2);
  v_ultimo   integer;
begin
  select total, estado into v_total, v_estado
  from public.ventas
  where id = p_id
  for update;

  if v_total is null then
    raise exception 'La venta no existe.';
  end if;
  if v_estado = 'Cancelada' then
    raise exception 'No se pueden registrar pagos en una venta cancelada.';
  end if;

  create temporary table _pagos_nuevos on commit drop as
  select ord::integer as orden,
         (elem->>'monto')::numeric(14,2) as monto,
         btrim(coalesce(elem->>'metodo', '')) as metodo
  from jsonb_array_elements(coalesce(p_pagos, '[]'::jsonb)) with ordinality as p(elem, ord);

  if not exists (select 1 from _pagos_nuevos) then
    raise exception 'Agrega al menos un pago.';
  end if;
  if exists (select 1 from _pagos_nuevos where monto is null or monto <= 0) then
    raise exception 'Cada pago debe ser mayor que cero.';
  end if;
  if exists (select 1 from _pagos_nuevos where metodo not in ('Efectivo', 'Transferencia')) then
    raise exception 'El medio de pago debe ser efectivo o transferencia.';
  end if;

  select coalesce(sum(monto), 0) into v_pagado
  from public.pagos_ventas
  where venta_id = p_id;
  select sum(monto) into v_nuevo from _pagos_nuevos;
  if v_pagado + v_nuevo > v_total then
    raise exception 'Los pagos no pueden superar el saldo pendiente de la venta.';
  end if;

  select coalesce(max(numero), 0) into v_ultimo
  from public.pagos_ventas
  where venta_id = p_id;

  insert into public.pagos_ventas (venta_id, numero, monto, metodo)
  select p_id, v_ultimo + row_number() over (order by orden)::integer, monto, metodo
  from _pagos_nuevos
  order by orden;

  insert into public.historial (accion, detalle)
  values ('Pago registrado', p_id || ' - ' || v_nuevo::text);

  return jsonb_build_object('ok', true, 'pagado', v_pagado + v_nuevo, 'saldo', v_total - v_pagado - v_nuevo);
end;
$$;
