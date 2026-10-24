begin;

create table if not exists public.business_period_state (
  id smallint primary key default 1 check (id = 1),
  started_on date not null,
  updated_by text not null default 'system' check (char_length(btrim(updated_by)) between 3 and 80),
  updated_at timestamptz not null default now()
);

create table if not exists public.business_period_archives (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  created_by text not null check (char_length(btrim(created_by)) between 3 and 80),
  created_at timestamptz not null default now(),
  unique (period_start, period_end),
  check (period_end >= period_start)
);

create index if not exists business_period_archives_end_idx
  on public.business_period_archives (period_end desc);

insert into public.business_period_state (id, started_on, updated_by)
values (
  1,
  coalesce((select min(business_date) from public.daily_sales_totals),
           (timezone('America/Cancun', now()))::date),
  'system'
)
on conflict (id) do nothing;

alter table public.business_period_state enable row level security;
alter table public.business_period_archives enable row level security;

revoke all on table public.business_period_state from public, anon, authenticated;
revoke all on table public.business_period_archives from public, anon, authenticated;
grant select, insert, update on table public.business_period_state to service_role;
grant select, insert on table public.business_period_archives to service_role;

create or replace function public.close_business_period(
  p_new_start date,
  p_created_by text
) returns public.business_period_archives
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_started_on date;
  v_period_end date;
  v_today date := (timezone('America/Cancun', now()))::date;
  v_week_start date;
  v_week_end date;
  v_snapshot jsonb;
  v_archive public.business_period_archives;
begin
  if p_new_start is null or p_new_start > v_today then
    raise exception 'La fecha del nuevo periodo no puede estar en el futuro.';
  end if;
  if char_length(btrim(p_created_by)) not between 3 and 80 then
    raise exception 'Responsable del cierre inválido.';
  end if;

  select started_on
    into v_started_on
    from public.business_period_state
    where id = 1
    for update;
  if not found then
    raise exception 'No existe la configuración del periodo activo.';
  end if;

  if v_started_on >= p_new_start then
    select *
      into v_archive
      from public.business_period_archives
      where period_end = p_new_start - 1
      order by created_at desc
      limit 1;
    if found then return v_archive; end if;
    raise exception 'El periodo activo ya comienza en esa fecha o después.';
  end if;

  v_period_end := p_new_start - 1;
  v_week_start := v_started_on - (extract(isodow from v_started_on)::integer - 1);
  v_week_end := v_period_end - (extract(isodow from v_period_end)::integer - 1);

  select jsonb_build_object(
    'schema_version', 1,
    'daily_sales', coalesce((
      select jsonb_agg(to_jsonb(day_row) order by day_row.business_date)
      from (
        select business_date, ticket_count, paid_total, cash_total, transfer_total,
               pending_total, cost_total
        from public.daily_sales_totals
        where business_date between v_started_on and v_period_end
      ) day_row
    ), '[]'::jsonb),
    'daily_products', coalesce((
      select jsonb_agg(to_jsonb(product_row) order by product_row.business_date, product_row.product_key)
      from (
        select business_date, product_key, product_id, product_name, size, quantity, amount
        from public.daily_product_totals
        where business_date between v_started_on and v_period_end
      ) product_row
    ), '[]'::jsonb),
    'daily_extras', coalesce((
      select jsonb_agg(to_jsonb(extra_row) order by extra_row.business_date, extra_row.extra_key)
      from (
        select business_date, extra_key, extra_id, extra_name, quantity, amount
        from public.daily_extra_totals
        where business_date between v_started_on and v_period_end
      ) extra_row
    ), '[]'::jsonb),
    'daily_expenses', coalesce((
      select jsonb_agg(to_jsonb(expense_row) order by expense_row.business_date, expense_row.created_at)
      from (
        select business_date, name, quantity, total, created_at
        from public.supply_expenses
        where business_date between v_started_on and v_period_end
      ) expense_row
    ), '[]'::jsonb),
    'weekly_expenses', coalesce((
      select jsonb_agg(to_jsonb(expense_row) order by expense_row.week_start, expense_row.created_at)
      from (
        select week_start, name, quantity, total, created_at
        from public.weekly_cash_expenses
        where week_start between v_week_start and v_week_end
      ) expense_row
    ), '[]'::jsonb),
    'inventory_items', coalesce((
      select jsonb_agg(to_jsonb(item_row) order by item_row.name)
      from (
        select id, name, unit, stock, minimum, cost_per_unit, active
        from public.inventory_items
      ) item_row
    ), '[]'::jsonb),
    'catalog_version', coalesce((select version from public.catalog_state where id = 1), 0)
  ) into v_snapshot;

  insert into public.business_period_archives
    (period_start, period_end, snapshot, created_by)
  values
    (v_started_on, v_period_end, v_snapshot, btrim(p_created_by))
  on conflict (period_start, period_end) do update
    set snapshot = excluded.snapshot,
        created_by = excluded.created_by,
        created_at = now()
  returning * into v_archive;

  insert into public.inventory_movements
    (item_id, quantity, reason, movement_type, resulting_stock, created_by)
  select id, -stock, 'Cierre de periodo ' || v_period_end, 'adjustment', 0,
         btrim(p_created_by)
  from public.inventory_items
  where stock > 0;

  update public.inventory_items
    set stock = 0,
        updated_at = now()
    where stock <> 0;

  update public.business_period_state
    set started_on = p_new_start,
        updated_by = btrim(p_created_by),
        updated_at = now()
    where id = 1;

  return v_archive;
end;
$$;

revoke all on function public.close_business_period(date, text) from public, anon, authenticated;
grant execute on function public.close_business_period(date, text) to service_role;

commit;
