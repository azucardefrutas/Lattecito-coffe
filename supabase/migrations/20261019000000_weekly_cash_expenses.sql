begin;

create table if not exists public.weekly_cash_expenses (
  id uuid primary key,
  week_start date not null default (
    (timezone('America/Cancun', now()))::date
    - (extract(isodow from timezone('America/Cancun', now()))::integer - 1)
  ),
  name text not null check (char_length(btrim(name)) between 2 and 100),
  quantity numeric(12,3) check (quantity is null or (quantity > 0 and quantity <= 100000)),
  total integer not null check (total > 0 and total <= 100000000),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now(),
  check (extract(isodow from week_start) = 1)
);

create index if not exists weekly_cash_expenses_week_start_idx
  on public.weekly_cash_expenses (week_start, created_at desc);

alter table public.weekly_cash_expenses enable row level security;
revoke all on table public.weekly_cash_expenses from anon, authenticated;
grant select, insert, update, delete on table public.weekly_cash_expenses to service_role;

commit;
