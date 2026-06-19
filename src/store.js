import { createClient } from "@supabase/supabase-js";

/* Camada de armazenamento da Convocação.
   A interface (get / set / list) é a mesma que o App usa — só a fonte muda.
   Aqui ela aponta para uma tabela chave-valor no Supabase. */

const URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;
const TABLE = "convocacao_kv";

const configured = Boolean(URL && ANON);
const supabase = configured ? createClient(URL, ANON) : null;

const mem = new Map();
let degraded = !configured;
let reason = configured
  ? ""
  : "Modo local: as chaves do Supabase não foram configuradas. Preencha o arquivo .env com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY e reinicie o servidor. Por enquanto a mesa funciona só neste dispositivo.";

function fallTo(msg) {
  degraded = true;
  reason = msg;
}

export const store = {
  isDegraded: () => degraded,
  degradedReason: () => reason,

  async get(key) {
    if (supabase && !degraded) {
      try {
        const { data, error } = await supabase
          .from(TABLE)
          .select("value")
          .eq("key", key)
          .maybeSingle();
        if (error) throw error;
        return data ? data.value : null;
      } catch (e) {
        fallTo(
          "Não consegui ler do Supabase. Confira a URL, a chave anônima e se a tabela convocacao_kv existe. Rodando em modo local por enquanto."
        );
        return mem.has(key) ? mem.get(key) : null;
      }
    }
    return mem.has(key) ? mem.get(key) : null;
  },

  async set(key, value) {
    mem.set(key, value);
    if (supabase && !degraded) {
      try {
        const { error } = await supabase
          .from(TABLE)
          .upsert({ key, value, updated_at: new Date().toISOString() });
        if (error) throw error;
        return true;
      } catch (e) {
        fallTo(
          "Não consegui gravar no Supabase. Confira as chaves e as políticas (RLS) da tabela convocacao_kv. Rodando em modo local por enquanto."
        );
        return true;
      }
    }
    return true;
  },

  async list(prefix) {
    if (supabase && !degraded) {
      try {
        const { data, error } = await supabase
          .from(TABLE)
          .select("key")
          .like("key", `${prefix}%`);
        if (error) throw error;
        return data ? data.map((r) => r.key) : [];
      } catch (e) {
        fallTo(
          "Não consegui listar do Supabase. Confira as chaves e as políticas da tabela. Rodando em modo local por enquanto."
        );
        return [...mem.keys()].filter((k) => k.startsWith(prefix));
      }
    }
    return [...mem.keys()].filter((k) => k.startsWith(prefix));
  },
};
