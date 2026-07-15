# Supabase migration procedure

## Phase 1 account foundation

1. Open the project’s Supabase SQL Editor.
2. Run `001_phase1_accounts.sql` once in its entirety.
3. In **Authentication → Providers**, enable Email and Google. Configure the Google OAuth client ID/secret and add the deployed app callback URL.
4. In **Authentication → URL Configuration**, set the site URL and allowed redirect URLs for local development and production.
5. Keep email confirmation enabled for production.
6. Set `CORS_ALLOW_ORIGINS` in the API environment to the comma-separated local and deployed web origins. Do not use `*` when credentials are enabled.

The Phase 1 API routes use the authenticated user’s access token and RLS-scoped database requests. Do not replace this with a browser-accessible service-role key.

## Phase 3 wardrobe and feedback

After Phase 1, run `002_phase3_wardrobe_feedback.sql`. It creates private wardrobe and feedback records with the same owner-only RLS model.

## Phase 4 data lifecycle

Run `003_phase4_data_lifecycle.sql` after the earlier migrations. Configure `SUPABASE_SERVICE_ROLE_KEY` only in the API deployment environment; it is required for the daily 30-day deletion worker and must never be sent to the browser.

## Saved locations

Run `004_saved_locations.sql` after Phase 1. It adds user-owned favorite locations protected by RLS.

## Wardrobe availability

Run `005_wardrobe_preferences.sql` after Phase 3. It adds favourite, season, and laundry-state fields so unavailable clothing is excluded from recommendations.

## Wardrobe details

Run `007_wardrobe_item_details.sql` after the wardrobe migrations. It adds subcategory, material, and personal notes used by the editable wardrobe catalog and material-based warmth guidance.

## Shared weather cache

Run `008_weather_forecast_cache_server_only.sql`. The backend writes this shared cache through `SUPABASE_SERVICE_ROLE_KEY`; browser roles cannot read or change it. Set `FORECAST_CACHE_TTL_SECONDS` and `WEATHER_BATCH_INTERVAL_HOURS` to the same interval (the default is 3 hours) so normal requests reuse the scheduled forecast refresh.
