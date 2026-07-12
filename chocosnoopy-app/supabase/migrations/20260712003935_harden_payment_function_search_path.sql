-- Las funciones de pago se ejecutan solo desde el servidor, pero fijar el
-- search_path evita que dependan del contexto de la conexión.
alter function public.crear_venta(jsonb) set search_path = public;
alter function public.agregar_pagos_venta(bigint, jsonb) set search_path = public;
