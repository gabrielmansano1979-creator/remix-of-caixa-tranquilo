-- Secure storage for tenant-owned NFS-e A1 certificates.
-- Certificate and password are application-encrypted before they reach this table.
create table if not exists public.configuracoes_fiscais (
  id uuid primary key default gen_random_uuid(),
  tenant_user_id uuid not null references auth.users(id) on delete cascade,
  cnpj text not null check (cnpj ~ '^[0-9]{14}$'),
  inscricao_municipal text,
  municipio_ibge text not null check (municipio_ibge ~ '^[0-9]{7}$'),
  regime_tributario text not null check (
    regime_tributario in ('mei', 'simples_nacional', 'lucro_presumido', 'lucro_real', 'outro')
  ),
  ambiente text not null default 'producao_restrita' check (
    ambiente in ('producao_restrita', 'producao')
  ),
  certificado_ciphertext text not null,
  certificado_nonce text not null,
  certificado_auth_tag text not null,
  senha_certificado_ciphertext text not null,
  senha_certificado_nonce text not null,
  senha_certificado_auth_tag text not null,
  encryption_key_version smallint not null default 1 check (encryption_key_version > 0),
  certificado_subject text,
  certificado_issuer text,
  certificado_serial text,
  certificado_valid_from timestamptz,
  certificado_valid_to timestamptz,
  status text not null default 'pendente' check (
    status in ('pendente', 'ativo', 'expirado', 'invalido', 'revogado')
  ),
  ultimo_erro_validacao text,
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (tenant_user_id, cnpj)
);

create index if not exists configuracoes_fiscais_tenant_status_idx
  on public.configuracoes_fiscais (tenant_user_id, status);

create or replace function public.set_configuracoes_fiscais_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists configuracoes_fiscais_atualizado_em on public.configuracoes_fiscais;
create trigger configuracoes_fiscais_atualizado_em
before update on public.configuracoes_fiscais
for each row execute function public.set_configuracoes_fiscais_atualizado_em();

alter table public.configuracoes_fiscais enable row level security;
alter table public.configuracoes_fiscais force row level security;

-- No direct browser-role policies or grants: certificate secrets are only read
-- by trusted Node.js server code using the Supabase service role.
revoke all on table public.configuracoes_fiscais from public, anon, authenticated;
grant select, insert, update, delete on table public.configuracoes_fiscais to service_role;
revoke all on function public.set_configuracoes_fiscais_atualizado_em() from public, anon, authenticated;
grant execute on function public.set_configuracoes_fiscais_atualizado_em() to service_role;
