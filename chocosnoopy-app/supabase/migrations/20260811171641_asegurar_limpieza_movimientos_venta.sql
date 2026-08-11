-- Reemplaza la primera versión para limpiar cualquier movimiento cuya
-- referencia sea la venta. Esto cubre tanto salidas/reintegros actuales como
-- cualquier otro movimiento de inventario que se asocie a la venta después.
create or replace function public.eliminar_venta_cancelada(p_id bigint)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_estado text;
begin
  if p_id is null or p_id <= 0 then
    raise exception 'La venta no es válida.';
  end if;

  select estado
  into v_estado
  from public.ventas
  where id = p_id
  for update;

  if not found then
    raise exception 'La venta no existe.';
  end if;

  if v_estado <> 'Cancelada' then
    raise exception 'Solo se pueden eliminar ventas canceladas.';
  end if;

  delete from public.movimientos_inventario
  where referencia = p_id::text;

  delete from public.historial
  where accion in ('Venta creada', 'Estado venta', 'Pago registrado')
    and (
      detalle like p_id::text || ' - %'
      or detalle like p_id::text || ':%'
    );

  delete from public.ventas
  where id = p_id;

  return jsonb_build_object('ok', true, 'id', p_id);
end;
$$;

revoke execute on function public.eliminar_venta_cancelada(bigint) from public;
revoke execute on function public.eliminar_venta_cancelada(bigint) from anon, authenticated;
grant execute on function public.eliminar_venta_cancelada(bigint) to service_role;
