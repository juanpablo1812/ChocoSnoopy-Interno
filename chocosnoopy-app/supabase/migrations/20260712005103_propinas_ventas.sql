-- ===========================================================================
-- Propinas por venta
-- ===========================================================================

create table public.propinas_ventas (
  id         bigint generated always as identity primary key,
  venta_id   bigint not null references public.ventas(id) on delete cascade,
  monto      numeric(14,2) not null check (monto > 0),
  fecha      timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index propinas_ventas_venta_idx on public.propinas_ventas (venta_id);
create index propinas_ventas_fecha_idx on public.propinas_ventas (fecha);

alter table public.propinas_ventas enable row level security;

-- Conserva la operación atómica de crear la venta y añade, si corresponde,
-- una propina que no modifica el total ni el saldo pendiente del cliente.
create function public.crear_venta_con_propina(payload jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_propina numeric(14,2) := coalesce((payload->>'propina')::numeric, 0);
  v_result jsonb;
  v_venta_id bigint;
begin
  if v_propina < 0 then
    raise exception 'La propina no puede ser negativa.';
  end if;

  v_result := public.crear_venta(payload - 'propina');
  v_venta_id := (v_result->>'id')::bigint;

  if v_propina > 0 then
    insert into public.propinas_ventas (venta_id, monto)
    values (v_venta_id, v_propina);
  end if;

  return v_result || jsonb_build_object('propina', v_propina);
end;
$$;

-- Registra nuevos pagos y una propina opcional en una sola transacción.
create function public.agregar_pagos_y_propina(
  p_id bigint,
  p_pagos jsonb,
  p_propina numeric(14,2) default 0
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if coalesce(p_propina, 0) < 0 then
    raise exception 'La propina no puede ser negativa.';
  end if;

  v_result := public.agregar_pagos_venta(p_id, p_pagos);

  if coalesce(p_propina, 0) > 0 then
    insert into public.propinas_ventas (venta_id, monto)
    values (p_id, p_propina);
  end if;

  return v_result || jsonb_build_object('propina', coalesce(p_propina, 0));
end;
$$;
