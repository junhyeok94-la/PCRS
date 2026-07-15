-- PCRS Phase 1: Supabase Auth-backed account and personalization data.
-- Run this migration in the Supabase SQL editor before enabling the new /api/v1/me/* APIs.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  height_cm numeric(5, 1) check (height_cm between 100 and 250),
  weight_kg numeric(5, 1) check (weight_kg between 25 and 300),
  body_fat_pct numeric(4, 1) check (body_fat_pct between 3 and 70),
  birth_year smallint check (birth_year between 1900 and 2100),
  sex text check (sex in ('female', 'male', 'undisclosed')),
  thermal_sensitivity smallint not null default 0 check (thermal_sensitivity between -2 and 2),
  default_activity text not null default 'walking' check (default_activity in ('sedentary', 'walking', 'commute', 'cycling', 'running', 'outdoor_work', 'indoor_exercise')),
  default_environment text not null default 'outdoor' check (default_environment in ('outdoor', 'indoor', 'mixed')),
  indoor_temperature_c numeric(4, 1) check (indoor_temperature_c between 10 and 35),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  consent_type text not null check (consent_type in ('terms', 'privacy', 'marketing')),
  policy_version text not null,
  granted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, consent_type)
);

create index if not exists idx_user_consents_user_id on public.user_consents (user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists user_consents_set_updated_at on public.user_consents;
create trigger user_consents_set_updated_at
before update on public.user_consents
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.user_consents enable row level security;

drop policy if exists "profiles_are_private_to_owner" on public.profiles;
create policy "profiles_are_private_to_owner"
on public.profiles
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "consents_are_private_to_owner" on public.user_consents;
create policy "consents_are_private_to_owner"
on public.user_consents
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
