import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Enquanto o Supabase não estiver configurado, o site funciona em modo
// demonstração (repertório local, pedidos desabilitados).
export const supabaseConfigured = Boolean(url && anonKey);

export const supabase = supabaseConfigured ? createClient(url, anonKey) : null;

export const PEDIDO_FUNCTION_URL = supabaseConfigured
  ? `${url}/functions/v1/pedido`
  : null;

export { anonKey };
