"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente de Supabase para el NAVEGADOR (clave pública `anon`).
 *
 * En esta versión sin login, casi todas las operaciones pasan por Server
 * Actions en el servidor. Este cliente queda disponible para cuando se añada
 * Supabase Auth y lecturas directas desde el cliente con RLS.
 */
let cliente: SupabaseClient | null = null;

export function crearClienteNavegador(): SupabaseClient {
  if (cliente) return cliente;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Faltan variables de entorno públicas de Supabase (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).",
    );
  }

  cliente = createClient(url, anonKey);
  return cliente;
}
