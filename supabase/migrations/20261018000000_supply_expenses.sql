begin;

create table if not exists public.supply_expenses (
  id uuid primary key,
  business_date date not null default ((timezone('America/Cancun', now()))::date),
  name text not null check (char_length(btrim(name)) between 2 and 100),
  quantity numeric(12,3) check (quantity is null or (quantity > 0 and quantity <= 100000)),
  total integer not null check (total > 0 and total <= 100000000),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now()
);

create index if not exists supply_expenses_business_date_idx
  on public.supply_expenses (business_date, created_at desc);

alter table public.supply_expenses enable row level security;
revoke all on table public.supply_expenses from anon, authenticated;
grant select, insert, update, delete on table public.supply_expenses to service_role;

commit;
