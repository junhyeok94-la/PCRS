-- PCRS Phase 4: 30-day reversible account deletion requests.

create table if not exists public.account_deletion_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now(),
  scheduled_delete_at timestamptz not null,
  cancelled_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scheduled_delete_at > requested_at)
);

create index if not exists idx_account_deletion_due
  on public.account_deletion_requests (scheduled_delete_at)
  where cancelled_at is null and executed_at is null;

drop trigger if exists account_deletion_requests_set_updated_at on public.account_deletion_requests;
create trigger account_deletion_requests_set_updated_at
before update on public.account_deletion_requests
for each row execute function public.set_updated_at();

alter table public.account_deletion_requests enable row level security;

drop policy if exists "deletion_request_is_private_to_owner" on public.account_deletion_requests;
create policy "deletion_request_is_private_to_owner" on public.account_deletion_requests
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
