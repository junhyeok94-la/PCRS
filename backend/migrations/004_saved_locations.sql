-- PCRS saved places: private user-owned locations for repeat recommendations.

create table if not exists public.user_locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  latitude numeric(8, 5) not null check (latitude between -90 and 90),
  longitude numeric(8, 5) not null check (longitude between -180 and 180),
  is_favorite boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_locations_user_id
  on public.user_locations (user_id, is_favorite desc, created_at desc);

drop trigger if exists user_locations_set_updated_at on public.user_locations;
create trigger user_locations_set_updated_at
before update on public.user_locations
for each row execute function public.set_updated_at();

alter table public.user_locations enable row level security;

drop policy if exists "locations_are_private_to_owner" on public.user_locations;
create policy "locations_are_private_to_owner" on public.user_locations
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
