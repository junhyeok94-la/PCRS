-- PCRS Phase 3: user-owned wardrobe catalog and recommendation feedback.

create table if not exists public.wardrobe_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  category text not null check (category in ('top', 'bottom', 'outerwear', 'shoes', 'accessory', 'other')),
  warmth_level smallint not null default 0 check (warmth_level between -2 and 2),
  water_resistant boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recommendation_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  feedback_type text not null check (feedback_type in ('too_hot', 'comfortable', 'too_cold')),
  utci_personalized numeric(5, 2),
  activity text,
  created_at timestamptz not null default now()
);

create index if not exists idx_wardrobe_items_user_id on public.wardrobe_items (user_id, archived, created_at desc);
create index if not exists idx_recommendation_feedback_user_id on public.recommendation_feedback (user_id, created_at desc);

drop trigger if exists wardrobe_items_set_updated_at on public.wardrobe_items;
create trigger wardrobe_items_set_updated_at
before update on public.wardrobe_items
for each row execute function public.set_updated_at();

alter table public.wardrobe_items enable row level security;
alter table public.recommendation_feedback enable row level security;

drop policy if exists "wardrobe_is_private_to_owner" on public.wardrobe_items;
create policy "wardrobe_is_private_to_owner" on public.wardrobe_items
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "recommendation_feedback_is_private_to_owner" on public.recommendation_feedback;
create policy "recommendation_feedback_is_private_to_owner" on public.recommendation_feedback
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
