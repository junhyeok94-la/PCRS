-- PCRS wardrobe availability preferences used by the recommendation engine.

alter table public.wardrobe_items
  add column if not exists is_favorite boolean not null default false,
  add column if not exists seasons text[] not null default array['spring', 'summer', 'fall', 'winter']::text[],
  add column if not exists is_in_laundry boolean not null default false;

alter table public.wardrobe_items
  drop constraint if exists wardrobe_items_seasons_valid;
alter table public.wardrobe_items
  add constraint wardrobe_items_seasons_valid
  check (seasons <@ array['spring', 'summer', 'fall', 'winter']::text[]);

create index if not exists idx_wardrobe_items_available
  on public.wardrobe_items (user_id, is_in_laundry, is_favorite desc, created_at desc)
  where archived = false;
