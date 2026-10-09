create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name_or_company text,
  tax_id text,
  crc_number text,
  role text not null default 'client' check (role in ('client', 'partner')),
  partner_status text not null default 'none' check (partner_status in ('none', 'pending_approval', 'approved', 'rejected')),
  is_admin boolean not null default false,
  pix_key_type text check (pix_key_type in ('cpf','cnpj','email','phone','random')),
  pix_key text,
  is_profile_complete boolean not null default false,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  partner_id uuid not null references public.profiles(id),
  discount_percent integer not null default 10,
  commission_percent integer not null default 20,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.commissions (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.profiles(id),
  subscription_id uuid,
  client_name text,
  amount numeric(12,2) not null default 0,
  status text not null default 'pending' check (status in ('pending','available','paid')),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  receipt_url text
);

create table if not exists public.accountant_invites (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id),
  accountant_email text not null,
  status text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.coupons enable row level security;
alter table public.commissions enable row level security;
alter table public.accountant_invites enable row level security;

create policy "profiles_self_access" on public.profiles for select using (auth.uid() = id);
create policy "profiles_self_update" on public.profiles for update using (auth.uid() = id);
create policy "profiles_self_insert" on public.profiles for insert with check (auth.uid() = id);

create policy "coupons_read" on public.coupons for select using (true);
create policy "commissions_admin_read" on public.commissions for select using (
  exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
);
create policy "accountant_invites_manage" on public.accountant_invites for all using (
  exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
);
