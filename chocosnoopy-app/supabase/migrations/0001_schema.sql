-- ==========================================================================
-- CHOCOSNOOPY  ·  Esquema de base de datos
-- Migración 0001 — Tablas, restricciones e índices
-- ==========================================================================
-- Reemplaza las hojas de Google Sheets del proyecto original por tablas
-- relacionales de PostgreSQL. Los IDs consecutivos manuales (P0001, M0001...)
-- se sustituyen por identidades autogeneradas de Postgres.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- Materias primas (insumos de inventario)
-- --------------------------------------------------------------------------
create table if not exists public.materias_primas (
  id                    bigint generated always as identity primary key,
  nombre                text        not null,
  unidad                text        not null,
  cantidad_presentacion numeric(14,4) not null check (cantidad_presentacion > 0),
  costo_total_compra    numeric(14,2) not null default 0 check (costo_total_compra >= 0),
  costo_unitario        numeric(14,6) not null default 0 check (costo_unitario >= 0),
  stock_actual          numeric(14,4) not null default 0 check (stock_actual >= 0),
  stock_minimo          numeric(14,4) not null default 0 check (stock_minimo >= 0),
  estado                text        not null default 'Activo' check (estado in ('Activo','Inactivo')),
  fecha_ingreso         date        not null default current_date,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Nombre único sin distinguir mayúsculas/acentos de espacios sobrantes.
create unique index if not exists materias_primas_nombre_key
  on public.materias_primas (lower(btrim(nombre)));

-- --------------------------------------------------------------------------
-- Productos (artículos que se venden)
-- --------------------------------------------------------------------------
create table if not exists public.productos (
  id                bigint generated always as identity primary key,
  nombre            text        not null,
  categoria         text        not null default '',
  precio_venta      numeric(14,2) not null check (precio_venta > 0),
  costo_produccion  numeric(14,2) not null default 0 check (costo_produccion >= 0),
  ganancia          numeric(14,2) not null default 0,
  estado            text        not null default 'Activo' check (estado in ('Activo','Inactivo')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index if not exists productos_nombre_key
  on public.productos (lower(btrim(nombre)));

-- --------------------------------------------------------------------------
-- Recetas (qué materias primas lleva cada producto y en qué cantidad)
-- --------------------------------------------------------------------------
create table if not exists public.recetas (
  id                bigint generated always as identity primary key,
  producto_id       bigint not null references public.productos(id) on delete cascade,
  materia_prima_id  bigint not null references public.materias_primas(id) on delete restrict,
  cantidad          numeric(14,4) not null check (cantidad > 0),
  unique (producto_id, materia_prima_id)
);

create index if not exists recetas_producto_idx on public.recetas (producto_id);
create index if not exists recetas_materia_idx  on public.recetas (materia_prima_id);

-- --------------------------------------------------------------------------
-- Ventas (cabecera)
-- --------------------------------------------------------------------------
create table if not exists public.ventas (
  id                 bigint generated always as identity primary key,
  cliente            text        not null default '',
  whatsapp           text        not null default '',
  fecha_creacion     timestamptz not null default now(),
  fecha_entrega      date,
  estado             text        not null default 'Pendiente' check (estado in ('Pendiente','Entregada','Cancelada')),
  total              numeric(14,2) not null default 0,
  ganancia           numeric(14,2) not null default 0,
  cantidad_productos int         not null default 0,
  created_at         timestamptz not null default now()
);

create index if not exists ventas_fecha_creacion_idx on public.ventas (fecha_creacion);
create index if not exists ventas_estado_idx on public.ventas (estado);

-- --------------------------------------------------------------------------
-- Detalle de ventas (líneas de cada venta)
-- --------------------------------------------------------------------------
create table if not exists public.detalle_ventas (
  id              bigint generated always as identity primary key,
  venta_id        bigint not null references public.ventas(id) on delete cascade,
  producto_id     bigint not null references public.productos(id) on delete restrict,
  nombre_producto text   not null,
  cantidad        int    not null check (cantidad > 0),
  precio_venta    numeric(14,2) not null,
  subtotal        numeric(14,2) not null
);

create index if not exists detalle_ventas_venta_idx on public.detalle_ventas (venta_id);

-- --------------------------------------------------------------------------
-- Movimientos de inventario (entradas/salidas de materias primas)
-- --------------------------------------------------------------------------
create table if not exists public.movimientos_inventario (
  id                bigint generated always as identity primary key,
  fecha             timestamptz not null default now(),
  materia_prima_id  bigint not null references public.materias_primas(id) on delete cascade,
  tipo              text   not null,
  cantidad          numeric(14,4) not null,
  unidad            text   not null default '',
  referencia        text   not null default '',
  nota              text   not null default ''
);

create index if not exists movimientos_referencia_idx on public.movimientos_inventario (referencia);
create index if not exists movimientos_materia_idx    on public.movimientos_inventario (materia_prima_id);

-- --------------------------------------------------------------------------
-- Historial (bitácora de acciones)
-- --------------------------------------------------------------------------
create table if not exists public.historial (
  id      bigint generated always as identity primary key,
  fecha   timestamptz not null default now(),
  accion  text not null,
  detalle text not null default ''
);

-- --------------------------------------------------------------------------
-- Mantener updated_at al día
-- --------------------------------------------------------------------------
create or replace function public.tocar_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists materias_primas_touch on public.materias_primas;
create trigger materias_primas_touch
  before update on public.materias_primas
  for each row execute function public.tocar_updated_at();

drop trigger if exists productos_touch on public.productos;
create trigger productos_touch
  before update on public.productos
  for each row execute function public.tocar_updated_at();

-- ==========================================================================
-- Row Level Security
-- --------------------------------------------------------------------------
-- Se activa RLS en todas las tablas. Como todavía no hay login, NO se crean
-- políticas permisivas: el acceso del navegador (clave anon) queda bloqueado
-- y toda escritura/lectura pasa por el servidor con la service_role_key, que
-- omite RLS. Cuando se añada Supabase Auth, se crearán aquí las políticas por
-- usuario autenticado.
-- ==========================================================================
alter table public.materias_primas       enable row level security;
alter table public.productos             enable row level security;
alter table public.recetas               enable row level security;
alter table public.ventas                enable row level security;
alter table public.detalle_ventas        enable row level security;
alter table public.movimientos_inventario enable row level security;
alter table public.historial             enable row level security;
