begin;

create table if not exists public.daily_sales_totals (
  business_date date primary key,
  ticket_count integer not null default 0 check (ticket_count >= 0),
  paid_total integer not null default 0 check (paid_total >= 0),
  cash_total integer not null default 0 check (cash_total >= 0),
  transfer_total integer not null default 0 check (transfer_total >= 0),
  pending_total integer not null default 0 check (pending_total >= 0),
  cost_total integer not null default 0 check (cost_total >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_product_totals (
  business_date date not null references public.daily_sales_totals(business_date) on delete cascade,
  product_key text not null,
  product_id text not null,
  product_name text not null,
  size text not null,
  quantity integer not null default 0 check (quantity >= 0),
  amount integer not null default 0 check (amount >= 0),
  primary key (business_date, product_key)
);

create table if not exists public.daily_extra_totals (
  business_date date not null references public.daily_sales_totals(business_date) on delete cascade,
  extra_key text not null,
  extra_id text not null,
  extra_name text not null,
  quantity integer not null default 0 check (quantity >= 0),
  amount integer not null default 0 check (amount >= 0),
  primary key (business_date, extra_key)
);

alter table public.daily_sales_totals enable row level security;
alter table public.daily_product_totals enable row level security;
alter table public.daily_extra_totals enable row level security;

revoke all on table public.daily_sales_totals from anon, authenticated;
revoke all on table public.daily_product_totals from anon, authenticated;
revoke all on table public.daily_extra_totals from anon, authenticated;
grant select, insert, update, delete on table public.daily_sales_totals to service_role;
grant select, insert, update, delete on table public.daily_product_totals to service_role;
grant select, insert, update, delete on table public.daily_extra_totals to service_role;

create or replace function public.add_sale_to_daily_rollup(
  p_sale public.admin_sales,
  p_count_ticket boolean,
  p_mark_paid boolean,
  p_clear_pending boolean
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item jsonb;
  v_extra jsonb;
  v_quantity integer;
  v_extras_unit integer;
  v_base_unit integer;
  v_product_id text;
  v_product_name text;
  v_size text;
  v_product_key text;
  v_extra_id text;
  v_extra_name text;
  v_extra_key text;
  v_extra_unit integer;
begin
  insert into public.daily_sales_totals (
    business_date,
    ticket_count,
    paid_total,
    cash_total,
    transfer_total,
    pending_total,
    cost_total
  ) values (
    p_sale.business_date,
    case when p_count_ticket then 1 else 0 end,
    case when p_mark_paid then p_sale.total else 0 end,
    case when p_mark_paid and p_sale.payment_method = 'Efectivo' then p_sale.total else 0 end,
    case when p_mark_paid and p_sale.payment_method = 'Transferencia' then p_sale.total else 0 end,
    case when not p_mark_paid and not p_clear_pending then p_sale.total else 0 end,
    case when p_mark_paid then p_sale.cost else 0 end
  )
  on conflict (business_date) do update set
    ticket_count = daily_sales_totals.ticket_count + excluded.ticket_count,
    paid_total = daily_sales_totals.paid_total + excluded.paid_total,
    cash_total = daily_sales_totals.cash_total + excluded.cash_total,
    transfer_total = daily_sales_totals.transfer_total + excluded.transfer_total,
    pending_total = greatest(
      0,
      daily_sales_totals.pending_total +
        case when p_clear_pending then -p_sale.total else excluded.pending_total end
    ),
    cost_total = daily_sales_totals.cost_total + excluded.cost_total,
    updated_at = now();

  if not p_mark_paid then return; end if;

  for v_item in select value from jsonb_array_elements(p_sale.items)
  loop
    v_quantity := greatest(1, coalesce((v_item->>'quantity')::integer, 1));
    select coalesce(sum(coalesce((value->>'unitPrice')::integer, 0)), 0)
      into v_extras_unit
      from jsonb_array_elements(coalesce(v_item->'extras', '[]'::jsonb));
    v_base_unit := coalesce(
      nullif(v_item->>'baseUnitPrice', '')::integer,
      greatest(0, coalesce((v_item->>'unitPrice')::integer, 0) - v_extras_unit)
    );
    v_product_name := coalesce(
      nullif(v_item->>'productName', ''),
      nullif(split_part(v_item->>'name', ' + ', 1), ''),
      'Producto'
    );
    v_size := coalesce(nullif(v_item->>'size', ''), 'Sin tamaño');
    v_product_id := coalesce(
      nullif(v_item->>'productId', ''),
      'legacy:' || md5(lower(v_product_name))
    );
    v_product_key := v_product_id || '|' || coalesce(v_item->>'sizeIndex', v_size);

    insert into public.daily_product_totals (
      business_date, product_key, product_id, product_name, size, quantity, amount
    ) values (
      p_sale.business_date,
      v_product_key,
      v_product_id,
      v_product_name,
      v_size,
      v_quantity,
      v_base_unit * v_quantity
    )
    on conflict (business_date, product_key) do update set
      product_name = excluded.product_name,
      size = excluded.size,
      quantity = daily_product_totals.quantity + excluded.quantity,
      amount = daily_product_totals.amount + excluded.amount;

    for v_extra in
      select value from jsonb_array_elements(coalesce(v_item->'extras', '[]'::jsonb))
    loop
      v_extra_name := coalesce(nullif(v_extra->>'name', ''), 'Extra');
      v_extra_id := coalesce(
        nullif(v_extra->>'id', ''),
        'legacy:' || md5(lower(v_extra_name))
      );
      v_extra_key := v_extra_id;
      v_extra_unit := greatest(0, coalesce((v_extra->>'unitPrice')::integer, 0));
      insert into public.daily_extra_totals (
        business_date, extra_key, extra_id, extra_name, quantity, amount
      ) values (
        p_sale.business_date,
        v_extra_key,
        v_extra_id,
        v_extra_name,
        v_quantity,
        v_extra_unit * v_quantity
      )
      on conflict (business_date, extra_key) do update set
        extra_name = excluded.extra_name,
        quantity = daily_extra_totals.quantity + excluded.quantity,
        amount = daily_extra_totals.amount + excluded.amount;
    end loop;
  end loop;
end;
$$;

create or replace function public.rollup_admin_sale_trigger()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.add_sale_to_daily_rollup(
      new,
      true,
      new.payment_status = 'Pagado',
      false
    );
  elsif old.payment_status = 'Pendiente' and new.payment_status = 'Pagado' then
    perform public.add_sale_to_daily_rollup(new, false, true, true);
  end if;
  return new;
end;
$$;

drop trigger if exists admin_sales_daily_rollup on public.admin_sales;
create trigger admin_sales_daily_rollup
after insert or update of payment_status on public.admin_sales
for each row execute function public.rollup_admin_sale_trigger();

alter table public.inventory_movements
  drop constraint if exists inventory_movements_sale_id_fkey;
alter table public.inventory_movements
  add constraint inventory_movements_sale_id_fkey
  foreign key (sale_id) references public.admin_sales(id) on delete set null;

create or replace function public.purge_old_admin_sales()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.admin_sales
  where created_at < now() - interval '7 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.add_sale_to_daily_rollup(public.admin_sales, boolean, boolean, boolean)
  from public, anon, authenticated;
revoke all on function public.rollup_admin_sale_trigger() from public, anon, authenticated;
revoke all on function public.purge_old_admin_sales() from public, anon, authenticated;
grant execute on function public.add_sale_to_daily_rollup(public.admin_sales, boolean, boolean, boolean)
  to service_role;
grant execute on function public.rollup_admin_sale_trigger() to service_role;
grant execute on function public.purge_old_admin_sales() to service_role;

commit;
