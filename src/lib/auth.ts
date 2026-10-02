import { supabase } from './supabase';

export async function cadastrarUsuario(email: string, password: string, dadosExtras: { full_name?: string; phone?: string } = {}) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: dadosExtras
    }
  });
  if (error) throw error;
  return data;
}

export async function entrarUsuario(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  if (error) throw error;
  return data;
}

export async function sairUsuario() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function obterUsuarioAtual() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}
