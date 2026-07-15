-- Rich wardrobe metadata for filters, editing, and material-aware warmth guidance.

alter table public.wardrobe_items
  add column if not exists subcategory text,
  add column if not exists material text,
  add column if not exists notes text;

alter table public.wardrobe_items
  add constraint wardrobe_items_subcategory_length check (subcategory is null or char_length(subcategory) <= 40),
  add constraint wardrobe_items_material_length check (material is null or char_length(material) <= 40),
  add constraint wardrobe_items_notes_length check (notes is null or char_length(notes) <= 240);

create index if not exists idx_wardrobe_items_filter
  on public.wardrobe_items (user_id, category, is_in_laundry, created_at desc)
  where archived = false;

comment on column public.wardrobe_items.subcategory is '선택한 의류 프리셋 또는 세부 분류';
comment on column public.wardrobe_items.material is '주 소재. 화면에서 보온 점수 안내에 사용';
comment on column public.wardrobe_items.notes is '착용감, 두께 등 개인 메모';
