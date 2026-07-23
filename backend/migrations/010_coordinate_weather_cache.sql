-- Coordinate-first forecast caching.
--
-- These tables intentionally coexist with the legacy location_dimension-based
-- caches during the rollout. After the application no longer reads the legacy
-- tables and their retention window has elapsed, they can be removed in a
-- separate destructive migration.

create table if not exists public.coordinate_weather_forecast_cache (
  cache_key text primary key,
  latitude numeric(8, 5) not null check (latitude between -90 and 90),
  longitude numeric(8, 5) not null check (longitude between -180 and 180),
  forecast_date date not null,
  hourly_data jsonb not null,
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists idx_coordinate_weather_forecast_cache_expiry
  on public.coordinate_weather_forecast_cache (expires_at);

alter table public.coordinate_weather_forecast_cache enable row level security;
revoke all on table public.coordinate_weather_forecast_cache from anon, authenticated;

drop trigger if exists coordinate_weather_forecast_cache_set_updated_at
  on public.coordinate_weather_forecast_cache;
create trigger coordinate_weather_forecast_cache_set_updated_at
before update on public.coordinate_weather_forecast_cache
for each row execute function public.set_updated_at();

create table if not exists public.personalized_coordinate_analysis_cache (
  user_id uuid not null references auth.users(id) on delete cascade,
  cache_key text not null,
  forecast_date date not null,
  selected_hour integer not null check (selected_hour between 0 and 167),
  profile_fingerprint text not null,
  result jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, cache_key, forecast_date, selected_hour, profile_fingerprint)
);

create index if not exists idx_personalized_coordinate_analysis_cache_expiry
  on public.personalized_coordinate_analysis_cache (expires_at);
create index if not exists idx_personalized_coordinate_analysis_cache_key
  on public.personalized_coordinate_analysis_cache (cache_key);

alter table public.personalized_coordinate_analysis_cache enable row level security;
revoke all on table public.personalized_coordinate_analysis_cache from anon, authenticated;

drop trigger if exists personalized_coordinate_analysis_cache_set_updated_at
  on public.personalized_coordinate_analysis_cache;
create trigger personalized_coordinate_analysis_cache_set_updated_at
before update on public.personalized_coordinate_analysis_cache
for each row execute function public.set_updated_at();

comment on table public.coordinate_weather_forecast_cache is
  'Server-only weather cache keyed by normalized coordinates, independent of location_dimension.';
comment on table public.personalized_coordinate_analysis_cache is
  'Server-only personalized recommendation cache keyed by normalized coordinates.';
