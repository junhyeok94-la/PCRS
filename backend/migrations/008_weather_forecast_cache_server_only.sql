-- Shared weather forecasts are written only by the backend's service-role client.
-- Browser clients must never read or write the cache directly.
alter table public.weather_forecast_cache enable row level security;

revoke all on table public.weather_forecast_cache from anon, authenticated;

comment on table public.weather_forecast_cache is
  'Server-managed shared forecast cache. Access is limited to the backend service role.';
