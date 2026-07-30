-- ===========================================================================
-- Tipos de chocolate y cajas personalizables por cupos
-- ===========================================================================
-- Una caja deja de guardar sabores/productos concretos. En su lugar define
-- cupos por tipo (por ejemplo 4 ChocoSnoopy + 2 ChocoRelleno). Al venderla se
-- elige el chocolate individual que llena cada cupo y se descuenta su receta.

create or replace function public.normalizar_tipo_chocolate(valor text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select regexp_replace(lower(btrim(valor)), '[[:space:]]+', '', 'g');
$$;

alter table public.productos
  add column if not exists tipo_chocolate text not null default '';

-- Clasificación inicial de los chocolates ya existentes. Después puede
-- ajustarse desde la edición normal de cada producto.
update public.productos
set tipo_chocolate = case
  when lower(nombre) like 'snoopy %' then 'ChocoSnoopy'
  when lower(nombre) like 'choco relleno %'
    or lower(nombre) like 'chocorelleno %' then 'ChocoRelleno'
  when lower(nombre) like 'barra %' then 'Barra'
  when lower(nombre) like 'cinnamoroll %' then 'Cinnamoroll'
  when lower(nombre) like 'corazón pequeño %'
    or lower(nombre) like 'corazon pequeño %' then 'Corazón pequeño'
  when lower(nombre) like 'hello kitty %' then 'Hello Kitty'
  when lower(nombre) like 'kuromi %' then 'Kuromi'
  when lower(nombre) like 'mini kitty %' then 'Mini Kitty'
  when lower(nombre) like 'my melody %' then 'My Melody'
  when lower(nombre) like 'pompompurin %' then 'Pompompurin'
  else btrim(nombre)
end
where tipo_producto = 'Individual'
  and public.normalizar_tipo_chocolate(tipo_chocolate) = '';

update public.productos
set tipo_chocolate = ''
where tipo_producto = 'Compuesto';

create index if not exists productos_tipo_chocolate_idx
  on public.productos (public.normalizar_tipo_chocolate(tipo_chocolate))
  where tipo_producto = 'Individual';

create table public.productos_componentes_tipos (
  id                     bigint generated always as identity primary key,
  producto_compuesto_id  bigint not null references public.productos(id) on delete cascade,
  tipo_chocolate         text not null,
  tipo_normalizado       text generated always as
    (public.normalizar_tipo_chocolate(tipo_chocolate)) stored,
  cantidad               integer not null check (cantidad > 0),
  check (public.normalizar_tipo_chocolate(tipo_chocolate) <> ''),
  unique (producto_compuesto_id, tipo_normalizado)
);

create index productos_componentes_tipos_compuesto_idx
  on public.productos_componentes_tipos (producto_compuesto_id);
create index productos_componentes_tipos_tipo_idx
  on public.productos_componentes_tipos (tipo_normalizado);

alter table public.productos_componentes_tipos enable row level security;

grant select, insert, update, delete
  on public.productos_componentes_tipos to service_role;
grant usage, select
  on sequence public.productos_componentes_tipos_id_seq to service_role;

-- Convierte las cajas actuales: conserva las cantidades, pero agrupa los
-- productos concretos que ahora pertenecen al mismo tipo.
insert into public.productos_componentes_tipos
  (producto_compuesto_id, tipo_chocolate, cantidad)
select
  pc.producto_compuesto_id,
  min(p.tipo_chocolate),
  sum(pc.cantidad)::integer
from public.productos_componentes pc
join public.productos p on p.id = pc.producto_componente_id
group by
  pc.producto_compuesto_id,
  public.normalizar_tipo_chocolate(p.tipo_chocolate);

drop table public.productos_componentes;

create table public.detalle_venta_chocolates (
  id                    bigint generated always as identity primary key,
  venta_id              bigint not null references public.ventas(id) on delete cascade,
  producto_caja_id      bigint not null references public.productos(id) on delete restrict,
  producto_chocolate_id bigint not null references public.productos(id) on delete restrict,
  tipo_chocolate        text not null,
  cantidad              integer not null check (cantidad > 0),
  unique (venta_id, producto_caja_id, producto_chocolate_id)
);

create index detalle_venta_chocolates_venta_idx
  on public.detalle_venta_chocolates (venta_id);
create index detalle_venta_chocolates_caja_idx
  on public.detalle_venta_chocolates (producto_caja_id);
create index detalle_venta_chocolates_producto_idx
  on public.detalle_venta_chocolates (producto_chocolate_id);

alter table public.detalle_venta_chocolates enable row level security;

grant select, insert, update, delete
  on public.detalle_venta_chocolates to service_role;
grant usage, select
  on sequence public.detalle_venta_chocolates_id_seq to service_role;

-- El costo mostrado para una caja es una estimación con el costo promedio de
-- los chocolates disponibles de cada tipo. La ganancia de la venta sí usa los
-- chocolates concretos seleccionados.
create or replace function public.recalcular_costos_productos()
returns void
language plpgsql
security invoker
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
          select sum(
            componente.cantidad * coalesce((
              select avg(chocolate.costo_produccion)
              from public.productos chocolate
              where chocolate.tipo_producto = 'Individual'
                and public.normalizar_tipo_chocolate(chocolate.tipo_chocolate)
                    = componente.tipo_normalizado
            ), 0)
          )
          from public.productos_componentes_tipos componente
          where componente.producto_compuesto_id = p.id
        ), 0),
      ganancia = p.precio_venta - (
        coalesce((
          select sum(mp.costo_unitario * r.cantidad)
          from public.recetas r
          join public.materias_primas mp on mp.id = r.materia_prima_id
          where r.producto_id = p.id
        ), 0)
        + coalesce((
          select sum(
            componente.cantidad * coalesce((
              select avg(chocolate.costo_produccion)
              from public.productos chocolate
              where chocolate.tipo_producto = 'Individual'
                and public.normalizar_tipo_chocolate(chocolate.tipo_chocolate)
                    = componente.tipo_normalizado
            ), 0)
          )
          from public.productos_componentes_tipos componente
          where componente.producto_compuesto_id = p.id
        ), 0)
      )
  where p.tipo_producto = 'Compuesto';
end;
$$;

-- ---------------------------------------------------------------------------
-- guardar_producto(payload)
-- componentes = [{ tipo_chocolate: text, cantidad: int }]
-- ---------------------------------------------------------------------------
create or replace function public.guardar_producto(payload jsonb)
returns public.productos
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id               bigint := nullif(payload->>'id', '')::bigint;
  v_nombre           text := btrim(coalesce(payload->>'nombre', ''));
  v_categoria        text := btrim(coalesce(payload->>'categoria', ''));
  v_tipo_producto    text := case
    when btrim(coalesce(payload->>'tipo_producto', 'Individual')) = 'Compuesto'
      then 'Compuesto'
    else 'Individual'
  end;
  v_tipo_chocolate   text := btrim(coalesce(payload->>'tipo_chocolate', ''));
  v_estado           text := case
    when btrim(coalesce(payload->>'estado', 'Activo')) = 'Inactivo'
      then 'Inactivo'
    else 'Activo'
  end;
  v_precio           numeric;
  v_producto         public.productos;
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

  if exists (
    select 1
    from public.productos
    where lower(btrim(nombre)) = lower(v_nombre)
      and id is distinct from v_id
  ) then
    raise exception 'Ya existe un producto con ese nombre.';
  end if;

  create temporary table _rec on commit drop as
  select
    (elem->>'materia_prima_id')::bigint as materia_prima_id,
    sum((elem->>'cantidad')::numeric) as cantidad
  from jsonb_array_elements(coalesce(payload->'recetas', '[]'::jsonb)) elem
  where coalesce(elem->>'materia_prima_id', '') <> ''
  group by 1;

  if exists (select 1 from _rec where cantidad is null or cantidad <= 0) then
    raise exception 'Cada cantidad de receta debe ser mayor que cero.';
  end if;
  if exists (
    select 1
    from _rec r
    left join public.materias_primas mp on mp.id = r.materia_prima_id
    where mp.id is null
  ) then
    raise exception 'Una materia prima de la receta no existe.';
  end if;

  create temporary table _comp on commit drop as
  select
    min(btrim(elem->>'tipo_chocolate')) as tipo_chocolate,
    public.normalizar_tipo_chocolate(elem->>'tipo_chocolate') as tipo_normalizado,
    sum((elem->>'cantidad')::numeric) as cantidad
  from jsonb_array_elements(coalesce(payload->'componentes', '[]'::jsonb)) elem
  where public.normalizar_tipo_chocolate(coalesce(elem->>'tipo_chocolate', '')) <> ''
  group by public.normalizar_tipo_chocolate(elem->>'tipo_chocolate');

  if v_tipo_producto = 'Individual' then
    if public.normalizar_tipo_chocolate(v_tipo_chocolate) = '' then
      raise exception 'Indica el tipo del chocolate.';
    end if;
    if not exists (select 1 from _rec) then
      raise exception 'Debes agregar al menos una materia prima a la receta del chocolate.';
    end if;
  end if;

  if v_tipo_producto = 'Compuesto' and not exists (select 1 from _comp) then
    raise exception 'Una caja debe incluir al menos un tipo de chocolate.';
  end if;

  if exists (
    select 1 from _comp
    where cantidad is null or cantidad <= 0 or cantidad <> floor(cantidad)
  ) then
    raise exception 'La cantidad de cada tipo debe ser un entero mayor que cero.';
  end if;

  if v_tipo_producto = 'Compuesto' and exists (
    select 1
    from _comp componente
    where not exists (
      select 1
      from public.productos chocolate
      where chocolate.tipo_producto = 'Individual'
        and chocolate.estado = 'Activo'
        and public.normalizar_tipo_chocolate(chocolate.tipo_chocolate)
            = componente.tipo_normalizado
    )
  ) then
    raise exception 'Cada tipo de la caja debe tener al menos un chocolate individual activo.';
  end if;

  if v_id is not null then
    update public.productos
    set nombre = v_nombre,
        categoria = v_categoria,
        tipo_producto = v_tipo_producto,
        tipo_chocolate = case when v_tipo_producto = 'Individual'
          then v_tipo_chocolate else '' end,
        precio_venta = v_precio,
        estado = v_estado
    where id = v_id
    returning * into v_producto;

    if v_producto.id is null then
      raise exception 'No existe el producto a actualizar.';
    end if;

    delete from public.recetas where producto_id = v_id;
    delete from public.productos_componentes_tipos
      where producto_compuesto_id = v_id;
  else
    insert into public.productos
      (nombre, categoria, tipo_producto, tipo_chocolate, precio_venta, estado)
    values
      (
        v_nombre,
        v_categoria,
        v_tipo_producto,
        case when v_tipo_producto = 'Individual' then v_tipo_chocolate else '' end,
        v_precio,
        v_estado
      )
    returning * into v_producto;
  end if;

  insert into public.recetas (producto_id, materia_prima_id, cantidad)
  select v_producto.id, materia_prima_id, cantidad
  from _rec;

  if v_tipo_producto = 'Compuesto' then
    insert into public.productos_componentes_tipos
      (producto_compuesto_id, tipo_chocolate, cantidad)
    select v_producto.id, tipo_chocolate, cantidad::integer
    from _comp;
  end if;

  perform public.recalcular_costos_productos();
  select * into v_producto
  from public.productos
  where id = v_producto.id;

  insert into public.historial (accion, detalle)
  values (
    case when v_id is null then 'Producto creado' else 'Producto actualizado' end,
    v_producto.id || ' - ' || v_nombre || ' (' || lower(v_tipo_producto) || ')'
  );

  return v_producto;
end;
$$;

-- ---------------------------------------------------------------------------
-- crear_venta(payload)
-- Cada caja incluye selecciones = [{ producto_id, cantidad }].
-- ---------------------------------------------------------------------------
create or replace function public.crear_venta(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_cliente        text := btrim(coalesce(payload->>'cliente', ''));
  v_whatsapp       text := btrim(coalesce(payload->>'whatsapp', ''));
  v_estado         text := btrim(coalesce(payload->>'estado', 'Pendiente'));
  v_fecha_entrega  date;
  v_venta_id       bigint;
  v_total          numeric(14,2) := 0;
  v_costo_real     numeric := 0;
  v_ganancia       numeric(14,2) := 0;
  v_cant           int := 0;
  v_pagado         numeric(14,2) := 0;
  m                record;
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
  select
    (elem->>'producto_id')::bigint as producto_id,
    sum((elem->>'cantidad')::numeric) as cantidad
  from jsonb_array_elements(coalesce(payload->'productos', '[]'::jsonb)) elem
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
    select 1
    from _sol s
    left join public.productos p on p.id = s.producto_id
    where p.id is null or p.estado <> 'Activo'
  ) then
    raise exception 'El producto seleccionado no está disponible.';
  end if;
  if exists (
    select 1
    from _sol s
    join public.productos p on p.id = s.producto_id
    where
      (p.tipo_producto = 'Individual' and not exists (
        select 1 from public.recetas r where r.producto_id = p.id
      ))
      or
      (p.tipo_producto = 'Compuesto' and not exists (
        select 1
        from public.productos_componentes_tipos pc
        where pc.producto_compuesto_id = p.id
      ))
  ) then
    raise exception 'Hay un producto incompleto en la venta.';
  end if;

  create temporary table _sel on commit drop as
  select
    (producto->>'producto_id')::bigint as caja_id,
    (seleccion->>'producto_id')::bigint as chocolate_id,
    sum((seleccion->>'cantidad')::numeric) as cantidad
  from jsonb_array_elements(coalesce(payload->'productos', '[]'::jsonb)) producto
  cross join lateral jsonb_array_elements(
    coalesce(producto->'selecciones', '[]'::jsonb)
  ) seleccion
  where coalesce(seleccion->>'producto_id', '') <> ''
  group by 1, 2;

  if exists (
    select 1
    from _sel seleccion
    join public.productos caja on caja.id = seleccion.caja_id
    where caja.tipo_producto <> 'Compuesto'
  ) then
    raise exception 'Los chocolates concretos solo se especifican para cajas.';
  end if;
  if exists (
    select 1 from _sel
    where cantidad is null or cantidad <= 0 or cantidad <> floor(cantidad)
  ) then
    raise exception 'La cantidad de cada chocolate elegido debe ser un entero mayor que cero.';
  end if;
  if exists (
    select 1
    from _sel seleccion
    left join public.productos chocolate on chocolate.id = seleccion.chocolate_id
    where chocolate.id is null
      or chocolate.tipo_producto <> 'Individual'
      or chocolate.estado <> 'Activo'
      or not exists (
        select 1 from public.recetas r where r.producto_id = chocolate.id
      )
  ) then
    raise exception 'Uno de los chocolates elegidos no está disponible.';
  end if;

  create temporary table _req_tipo on commit drop as
  select
    s.producto_id as caja_id,
    componente.tipo_normalizado,
    componente.tipo_chocolate,
    (componente.cantidad * s.cantidad)::numeric as cantidad
  from _sol s
  join public.productos caja
    on caja.id = s.producto_id and caja.tipo_producto = 'Compuesto'
  join public.productos_componentes_tipos componente
    on componente.producto_compuesto_id = caja.id;

  create temporary table _sel_tipo on commit drop as
  select
    seleccion.caja_id,
    public.normalizar_tipo_chocolate(chocolate.tipo_chocolate) as tipo_normalizado,
    min(chocolate.tipo_chocolate) as tipo_chocolate,
    sum(seleccion.cantidad) as cantidad
  from _sel seleccion
  join public.productos chocolate on chocolate.id = seleccion.chocolate_id
  group by
    seleccion.caja_id,
    public.normalizar_tipo_chocolate(chocolate.tipo_chocolate);

  if exists (
    select 1
    from _req_tipo requerido
    full join _sel_tipo elegido
      on elegido.caja_id = requerido.caja_id
      and elegido.tipo_normalizado = requerido.tipo_normalizado
    where coalesce(requerido.cantidad, 0) <> coalesce(elegido.cantidad, 0)
  ) then
    raise exception 'La selección de chocolates no coincide con los tipos y cantidades de la caja.';
  end if;

  select
    coalesce(sum(p.precio_venta * s.cantidad), 0),
    coalesce(sum(s.cantidad), 0)::int
  into v_total, v_cant
  from _sol s
  join public.productos p on p.id = s.producto_id;

  select
    coalesce((
      select sum(mp.costo_unitario * r.cantidad * s.cantidad)
      from _sol s
      join public.recetas r on r.producto_id = s.producto_id
      join public.materias_primas mp on mp.id = r.materia_prima_id
    ), 0)
    +
    coalesce((
      select sum(mp.costo_unitario * r.cantidad * seleccion.cantidad)
      from _sel seleccion
      join public.recetas r on r.producto_id = seleccion.chocolate_id
      join public.materias_primas mp on mp.id = r.materia_prima_id
    ), 0)
  into v_costo_real;

  v_ganancia := v_total - v_costo_real;

  create temporary table _pagos on commit drop as
  select
    ord::integer as orden,
    (elem->>'monto')::numeric(14,2) as monto,
    btrim(coalesce(elem->>'metodo', '')) as metodo
  from jsonb_array_elements(coalesce(payload->'pagos', '[]'::jsonb))
    with ordinality as p(elem, ord);

  if exists (select 1 from _pagos where monto is null or monto <= 0) then
    raise exception 'Cada pago debe ser mayor que cero.';
  end if;
  if exists (
    select 1 from _pagos
    where metodo not in ('Efectivo', 'Transferencia')
  ) then
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
  select
    v_venta_id,
    p.id,
    p.nombre,
    s.cantidad::int,
    p.precio_venta,
    p.precio_venta * s.cantidad
  from _sol s
  join public.productos p on p.id = s.producto_id;

  insert into public.detalle_venta_chocolates
    (
      venta_id,
      producto_caja_id,
      producto_chocolate_id,
      tipo_chocolate,
      cantidad
    )
  select
    v_venta_id,
    seleccion.caja_id,
    seleccion.chocolate_id,
    chocolate.tipo_chocolate,
    seleccion.cantidad::int
  from _sel seleccion
  join public.productos chocolate on chocolate.id = seleccion.chocolate_id;

  insert into public.pagos_ventas (venta_id, numero, monto, metodo)
  select v_venta_id, orden, monto, metodo
  from _pagos
  order by orden;

  for m in
    select requerimientos.materia_prima_id, sum(requerimientos.cantidad) as requerido
    from (
      -- Recetas de chocolates vendidos individualmente e insumos propios
      -- de las cajas (empaque, sticker, etc.).
      select
        r.materia_prima_id,
        r.cantidad * s.cantidad as cantidad
      from _sol s
      join public.recetas r on r.producto_id = s.producto_id

      union all

      -- Recetas de los chocolates concretos elegidos dentro de las cajas.
      select
        r.materia_prima_id,
        r.cantidad * seleccion.cantidad as cantidad
      from _sel seleccion
      join public.recetas r on r.producto_id = seleccion.chocolate_id
    ) requerimientos
    group by requerimientos.materia_prima_id
    order by requerimientos.materia_prima_id
  loop
    declare
      v_mp public.materias_primas;
    begin
      select * into v_mp
      from public.materias_primas
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
        (
          m.materia_prima_id,
          'Salida por venta',
          -m.requerido,
          v_mp.unidad,
          v_venta_id::text,
          'Reserva de inventario'
        );
    end;
  end loop;

  insert into public.historial (accion, detalle)
  values (
    'Venta creada',
    v_venta_id || ' - ' || coalesce(nullif(v_cliente, ''), 'Consumidor final')
  );

  return jsonb_build_object(
    'ok', true,
    'id', v_venta_id,
    'total', v_total,
    'ganancia', v_ganancia,
    'pagado', v_pagado
  );
end;
$$;

select public.recalcular_costos_productos();
