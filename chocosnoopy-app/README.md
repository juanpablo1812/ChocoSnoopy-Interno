# Chocosnoopy — Sistema de gestión interna (versión Next.js + Supabase)

> **Para el desarrollador que recibe este proyecto.**
> Esto es la **reescritura preparada** del sistema Chocosnoopy que antes vivía en Google
> Apps Script + Google Sheets. El código de aplicación está **completo y compila**. Lo que
> falta es **conectarlo a TU propio Supabase y desplegarlo en TU Vercel** siguiendo la guía
> de abajo. No hay ninguna base de datos creada todavía: tú la creas y aplicas las
> migraciones que ya vienen listas.

## Qué es esto

App web para gestionar **productos, materias primas (inventario), recetas y ventas** de la
chocolatería Chocosnoopy.

Stack:

- **Next.js 14** (App Router) + **TypeScript** + **Tailwind CSS**
- **Supabase** (PostgreSQL) como base de datos
- Pensada para desplegar en **Vercel**
- Diseño **mobile-first** (navbar inferior), en español, moneda `es-CO`

## Módulos incluidos

| Módulo | Qué hace |
|--------|----------|
| **Dashboard** (`/`) | Resumen de ventas hoy / semana / mes y alertas de stock bajo |
| **Productos** (`/productos`) | Chocolates individuales con receta y cajas compuestas; el costo y la ganancia se calculan solos |
| **Inventario** (`/inventario`) | Materias primas: stock, costo unitario, mínimos, ajustes y alertas |
| **Ventas** (`/ventas`) | Registrar ventas que descuentan inventario según la receta; cancelar reintegra el stock |

> Los módulos Compras, Reportes, Configuración y Contabilidad **no** se incluyeron (en el
> proyecto original eran archivos vacíos). El código queda estructurado para añadirlos.

---

## Puesta en marcha (paso a paso)

### 1. Requisitos
- Node.js 18+ y npm
- Una cuenta en [Supabase](https://supabase.com) y otra en [Vercel](https://vercel.com)

### 2. Instalar dependencias
```bash
npm install
```

### 3. Crear el proyecto de Supabase y aplicar las migraciones
1. En [supabase.com](https://supabase.com) crea un **proyecto nuevo** (anota la contraseña de
   la base de datos).
2. Abre el **SQL Editor** del proyecto y ejecuta, **en orden**, el contenido de:
   - [`supabase/migrations/0001_schema.sql`](supabase/migrations/0001_schema.sql) — crea las tablas.
   - [`supabase/migrations/0002_functions.sql`](supabase/migrations/0002_functions.sql) — crea las funciones de negocio.
   - Las migraciones posteriores de la misma carpeta, incluido
     [`supabase/migrations/20260712015507_productos_compuestos.sql`](supabase/migrations/20260712015507_productos_compuestos.sql), en orden de nombre. Esta última añade chocolates individuales y cajas compuestas.

   (Alternativa: si usas la [CLI de Supabase](https://supabase.com/docs/guides/local-development),
   estas migraciones ya están en la carpeta `supabase/migrations` y puedes usar `supabase db push`.)

### 4. Configurar las variables de entorno
1. Copia `.env.local.example` como `.env.local`.
2. En Supabase, ve a **Project Settings → API** y copia:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** (secreta) → `SUPABASE_SERVICE_ROLE_KEY`

```env
NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
```

### 5. Ejecutar en local
```bash
npm run dev
```
Abre http://localhost:3000. Para probar el flujo completo:
1. Crea 2–3 materias primas en **Inventario**.
2. Crea un producto con receta en **Productos** (verás el costo y la ganancia calculados solos).
3. Registra una venta en **Ventas** → el stock baja según la receta.
4. Cancela esa venta → el stock se reintegra.
5. El **Dashboard** muestra los totales del día/semana/mes.

### 6. Desplegar en Vercel
1. Sube este repositorio a GitHub (ver nota sobre la carpeta más abajo).
2. En Vercel: **Add New → Project** e importa el repo.
3. **Importante:** si el código está dentro de una subcarpeta (p. ej. `chocosnoopy-app/`),
   en Vercel pon esa carpeta como **Root Directory**.
4. Agrega las 3 variables de entorno (las mismas del paso 4).
5. **Deploy.**

---

## Cómo está construido (para retomarlo)

```
supabase/migrations/     Esquema (0001) y funciones de negocio (0002)
src/
  lib/
    supabase/server.ts   Cliente de servidor (service_role) — solo servidor
    supabase/client.ts   Cliente de navegador (anon) — para cuando se añada login
    types.ts             Tipos del modelo
    format.ts            dinero(), fechas
    validation.ts        Esquemas Zod (validación en servidor)
  components/            Navbar, Modal, Toast, PageHeader, EmptyState
  app/
    page.tsx             Dashboard
    productos/ inventario/ ventas/   páginas (Server Components)
  features/
    <modulo>/data.ts     Lecturas (server-only)
    <modulo>/actions.ts  Server Actions (mutaciones)
    <modulo>/*Cliente.tsx Componentes de cliente (listas + modales)
```

### Decisiones clave
- **La lógica crítica está en PostgreSQL, no en JavaScript.** Crear venta, cancelar venta y
  guardar producto con receta se ejecutan como **funciones PL/pgSQL transaccionales**
  (`crear_venta`, `cambiar_estado_venta`, `guardar_producto` en `0002_functions.sql`). Así el
  cálculo de total/costo/ganancia y el descuento de inventario son atómicos y seguros ante
  ventas simultáneas. Esto reemplaza al `LockService` del proyecto original en Apps Script.
- **Todas las escrituras pasan por el servidor** (Server Actions) con la `service_role_key`,
  que **nunca** llega al navegador.
- **IDs automáticos:** Postgres genera los IDs (`identity`). Se eliminó la generación manual
  de consecutivos (`P0001`, `M0001`…) que usaba la hoja `Configuracion`.
- **Bug corregido:** en el original el dashboard filtraba por un campo `Fecha` inexistente y
  los totales salían en 0. Aquí el dashboard consulta por `fecha_creacion` con rangos de fecha
  correctos (y respeta la zona horaria de Colombia, UTC-5).

---

## Seguridad — leer antes de producción

- **Esta versión no tiene login todavía.** El acceso queda protegido solo por el enlace y
  porque toda escritura pasa por el servidor. Es suficiente para arrancar y probar.
- Las tablas ya tienen **Row Level Security activado** (sin políticas abiertas), preparado
  para añadir **Supabase Auth**. Antes de manejar datos reales de clientes en producción,
  conviene añadir autenticación y políticas RLS por usuario.
- `SUPABASE_SERVICE_ROLE_KEY` tiene permisos totales: nunca la subas al repositorio ni la uses
  en componentes de cliente. Solo en `.env.local` (ignorado por git) y en las variables de
  entorno de Vercel.

---

## Origen

Migrado desde el proyecto original en Google Apps Script (`.gs` + Google Sheets). Se conservó
toda la lógica de negocio (reserva/reintegro de inventario, costos desde receta, validaciones,
resúmenes) y el diseño mobile-first; se descartó la fontanería específica de Apps Script
(`google.script.run`, plantillas `include`, lectura de celdas, consecutivos manuales).
