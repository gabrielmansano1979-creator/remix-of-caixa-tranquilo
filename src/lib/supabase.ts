import { createClient } from '@supabase/supabase-js';

// Utilitário resiliente: prioriza import.meta.env (Vite) e faz fallback para window.__CRIEFY_ENV__
const getEnv = (key: string): string => {
  if (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env[key]) {
    return (import.meta as any).env[key];
  }
  if (typeof window !== 'undefined' && (window as any).__CRIEFY_ENV__ && (window as any).__CRIEFY_ENV__[key]) {
    return (window as any).__CRIEFY_ENV__[key];
  }
  return '';
};

const supabaseUrl = getEnv('VITE_SUPABASE_URL') || 'https://criefy.com/api/cloud/d8dfa074-b67b-48a7-b2a1-d117b5436ebf';
const supabaseAnonKey = getEnv('VITE_SUPABASE_ANON_KEY') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6ImNyaWVmeS1jbG91ZCIsInByb2plY3RfaWQiOiJkOGRmYTA3NC1iNjdiLTQ4YTctYjJhMS1kMTE3YjU0MzZlYmYiLCJpYXQiOjE3OTA5MDU4NTcsImV4cCI6MjEwNjI2NTg1N30.IodvSE0hZY_mo9qrl58P4Wqfj_V4cFKVpCCuj2Ui80Q';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[CrieFy Cloud] Variaveis de conexao nao encontradas. Verifique o arquivo .env');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
