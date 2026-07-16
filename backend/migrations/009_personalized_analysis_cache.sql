-- Fast server-side cache for authenticated recommendation responses.
-- A row represents one user, location, forecast-hour slot, and profile input
-- revision. The result is never exposed directly to browser database roles.

alter table public.weather_forecast_cache
  add column if not exists expires_at timestamptz;

update public.weather_forecast_cache
set expires_at = coalesce(expires_at, updated_at + interval '3 hours');

alter table public.weather_forecast_cache
  alter column expires_at set not null;

drop trigger if exists weather_forecast_cache_set_updated_at on public.weather_forecast_cache;
create trigger weather_forecast_cache_set_updated_at
before update on public.weather_forecast_cache
for each row execute function public.set_updated_at();

create table if not exists public.personalized_analysis_cache (
  user_id uuid not null references auth.users(id) on delete cascade,
  location_id integer not null references public.location_dimension(id) on delete cascade,
  forecast_date date not null,
  selected_hour integer not null check (selected_hour between 0 and 167),
  profile_fingerprint text not null,
  result jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, location_id, forecast_date, selected_hour, profile_fingerprint)
);

create index if not exists idx_personalized_analysis_cache_expiry
  on public.personalized_analysis_cache (expires_at);

create index if not exists idx_personalized_analysis_cache_location
  on public.personalized_analysis_cache (location_id);

alter table public.personalized_analysis_cache enable row level security;
revoke all on table public.personalized_analysis_cache from anon, authenticated;

drop trigger if exists personalized_analysis_cache_set_updated_at on public.personalized_analysis_cache;
create trigger personalized_analysis_cache_set_updated_at
before update on public.personalized_analysis_cache
for each row execute function public.set_updated_at();

comment on table public.personalized_analysis_cache is
  'Server-only cache of authenticated personalized recommendation responses. Invalidated on weather, profile, wardrobe, and feedback changes.';
