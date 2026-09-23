begin;

alter table public.admin_sales
  add column if not exists last_edited_at timestamptz,
  add column if not exists last_edited_by text,
  add column if not exists correction_reason text;

create table if not exists public.admin_sale_corrections (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null,
  order_number bigint not null,
  action text not null check (action in ('edit', 'delete')),
  reason text not null check (char_length(btrim(reason)) between 5 and 300),
  performed_by text not null,
  sale_snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists admin_sale_corrections_created_at_idx
  on public.admin_sale_corrections (created_at desc);

alter table public.admin_sale_corrections enable row level security;
revoke all on table public.admin_sale_corrections from anon, authenticated;
grant select, insert, delete on table public.admin_sale_corrections to service_role;

create or replace function public.rebuild_daily_sales_rollup(p_business_date date)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_sale public.admin_sales;
begin
  perform pg_advisory_xact_lock(hashtext('lattecito-sales-' || p_business_date::text));

  delete from public.daily_product_totals where business_date = p_business_date;
  delete from public.daily_extra_totals where business_date = p_business_date;
  delete from public.daily_sales_totals where business_date = p_business_date;

  for v_sale in
    select *
    from public.admin_sales
    where business_date = p_business_date
    order by created_at, id
  loop
    perform public.add_sale_to_daily_rollup(
      v_sale,
      true,
      v_sale.payment_status = 'Pagado',
      false
    );
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
  if current_setting('lattecito.purge_details', true) = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform public.rebuild_daily_sales_rollup(old.business_date);
    return old;
  end if;

  if tg_op = 'UPDATE' and old.business_date <> new.business_date then
    perform public.rebuild_daily_sales_rollup(old.business_date);
  end if;
  perform public.rebuild_daily_sales_rollup(new.business_date);
  return new;
end;
$$;

drop trigger if exists admin_sales_daily_rollup on public.admin_sales;
create trigger admin_sales_daily_rollup
after insert or update or delete on public.admin_sales
for each row execute function public.rollup_admin_sale_trigger();

create or replace function public.correct_admin_sale_with_inventory(
  p_id uuid,
  p_editor text,
  p_reason text,
  p_customer text,
  p_note text,
  p_items jsonb,
  p_subtotal integer,
  p_total integer,
  p_cost integer,
  p_payment_method text,
  p_payment_status text,
  p_received integer,
  p_change integer,
  p_consumption jsonb
) returns public.admin_sales
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_sale public.admin_sales;
  v_need record;
  v_item public.inventory_items;
  v_next numeric(14,3);
begin
  if char_length(btrim(p_reason)) not between 5 and 300 then
    raise exception 'Indica el motivo de la corrección (5 a 300 caracteres).';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El ticket debe conservar al menos un producto.';
  end if;
  if jsonb_typeof(p_consumption) <> 'array' then
    raise exception 'Consumo de inventario inválido.';
  end if;
  if p_payment_method not in ('Efectivo', 'Transferencia')
     or p_payment_status not in ('Pagado', 'Pendiente') then
    raise exception 'Método o estado de pago inválido.';
  end if;
  if p_payment_method = 'Efectivo' and (p_payment_status <> 'Pagado' or p_received < p_total) then
    raise exception 'El efectivo recibido es insuficiente.';
  end if;
  if p_subtotal < 0 or p_total < 0 or p_cost < 0 or p_received < 0 or p_change < 0 then
    raise exception 'Los importes del ticket no son válidos.';
  end if;

  select * into v_sale from public.admin_sales where id = p_id for update;
  if not found then raise exception 'El ticket no existe.'; end if;
  if v_sale.business_date <> (timezone('America/Cancun', now()))::date then
    raise exception 'Sólo se pueden corregir tickets del día actual.';
  end if;

  insert into public.admin_sale_corrections
    (sale_id, order_number, action, reason, performed_by, sale_snapshot)
  values
    (v_sale.id, v_sale.order_number, 'edit', btrim(p_reason), p_editor, to_jsonb(v_sale));

  for v_need in
    select item_id, -sum(quantity) as quantity
    from public.inventory_movements
    where sale_id = p_id
    group by item_id
    having sum(quantity) < 0
    order by item_id
  loop
    update public.inventory_items
      set stock = stock + v_need.quantity, updated_at = now()
      where id = v_need.item_id
      returning stock into v_next;
    insert into public.inventory_movements
      (item_id, quantity, reason, movement_type, resulting_stock, sale_id, created_by)
    values
      (v_need.item_id, v_need.quantity,
       'Reposición por corrección del ticket #' || v_sale.order_number || ': ' || btrim(p_reason),
       'adjustment', v_next, v_sale.id, p_editor);
  end loop;

  for v_need in
    select (value->>'itemId')::uuid as item_id, (value->>'quantity')::numeric as quantity
    from jsonb_array_elements(p_consumption)
    order by (value->>'itemId')::uuid
  loop
    if v_need.quantity <= 0 or v_need.quantity > 100000 or scale(v_need.quantity) > 3 then
      raise exception 'Cantidad de receta inválida.';
    end if;
    select * into v_item
      from public.inventory_items where id = v_need.item_id and active for update;
    if not found then raise exception 'La receta contiene un insumo inactivo o inexistente.'; end if;
    if v_item.unit = 'pieza' and v_need.quantity <> trunc(v_need.quantity) then
      raise exception 'Las piezas deben consumirse en cantidades enteras.';
    end if;
    if v_item.stock < v_need.quantity then
      raise exception 'Insumo insuficiente: %.', v_item.name;
    end if;
  end loop;

  update public.admin_sales set
    customer = btrim(p_customer),
    note = btrim(p_note),
    items = p_items,
    subtotal = p_subtotal,
    total = p_total,
    cost = p_cost,
    payment_method = p_payment_method,
    payment_status = p_payment_status,
    received = p_received,
    change = p_change,
    confirmed_by = case
      when p_payment_method = 'Transferencia' and p_payment_status = 'Pagado'
        then coalesce(v_sale.confirmed_by, p_editor)
      else null
    end,
    confirmed_at = case
      when p_payment_method = 'Transferencia' and p_payment_status = 'Pagado'
        then coalesce(v_sale.confirmed_at, now())
      else null
    end,
    last_edited_at = now(),
    last_edited_by = p_editor,
    correction_reason = btrim(p_reason)
  where id = p_id
  returning * into v_sale;

  for v_need in
    select (value->>'itemId')::uuid as item_id, (value->>'quantity')::numeric as quantity
    from jsonb_array_elements(p_consumption)
  loop
    update public.inventory_items
      set stock = stock - v_need.quantity, updated_at = now()
      where id = v_need.item_id
      returning stock into v_next;
    insert into public.inventory_movements
      (item_id, quantity, reason, movement_type, resulting_stock, sale_id, created_by)
    values
      (v_need.item_id, -v_need.quantity, 'Ticket #' || v_sale.order_number || ' corregido',
       'sale', v_next, v_sale.id, p_editor);
  end loop;

  return v_sale;
end;
$$;

create or replace function public.delete_admin_sale_with_inventory(
  p_id uuid,
  p_deleted_by text,
  p_reason text
) returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_sale public.admin_sales;
  v_need record;
  v_next numeric(14,3);
begin
  if char_length(btrim(p_reason)) not between 5 and 300 then
    raise exception 'Indica el motivo de la eliminación (5 a 300 caracteres).';
  end if;
  select * into v_sale from public.admin_sales where id = p_id for update;
  if not found then raise exception 'El ticket no existe.'; end if;
  if v_sale.business_date <> (timezone('America/Cancun', now()))::date then
    raise exception 'Sólo se pueden eliminar tickets del día actual.';
  end if;

  insert into public.admin_sale_corrections
    (sale_id, order_number, action, reason, performed_by, sale_snapshot)
  values
    (v_sale.id, v_sale.order_number, 'delete', btrim(p_reason), p_deleted_by, to_jsonb(v_sale));

  for v_need in
    select item_id, -sum(quantity) as quantity
    from public.inventory_movements
    where sale_id = p_id
    group by item_id
    having sum(quantity) < 0
    order by item_id
  loop
    update public.inventory_items
      set stock = stock + v_need.quantity, updated_at = now()
      where id = v_need.item_id
      returning stock into v_next;
    insert into public.inventory_movements
      (item_id, quantity, reason, movement_type, resulting_stock, sale_id, created_by)
    values
      (v_need.item_id, v_need.quantity,
       'Reposición por eliminación del ticket #' || v_sale.order_number || ': ' || btrim(p_reason),
       'adjustment', v_next, v_sale.id, p_deleted_by);
  end loop;

  delete from public.admin_sales where id = p_id;
  return v_sale.order_number;
end;
$$;

create or replace function public.purge_old_admin_sales()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_deleted integer;
begin
  perform set_config('lattecito.purge_details', 'on', true);
  delete from public.admin_sales where created_at < now() - interval '7 days';
  get diagnostics v_deleted = row_count;
  delete from public.admin_sale_corrections where created_at < now() - interval '7 days';
  perform set_config('lattecito.purge_details', 'off', true);
  return v_deleted;
end;
$$;

revoke all on function public.rebuild_daily_sales_rollup(date) from public, anon, authenticated;
revoke all on function public.correct_admin_sale_with_inventory(uuid, text, text, text, text, jsonb, integer, integer, integer, text, text, integer, integer, jsonb) from public, anon, authenticated;
revoke all on function public.delete_admin_sale_with_inventory(uuid, text, text) from public, anon, authenticated;
grant execute on function public.rebuild_daily_sales_rollup(date) to service_role;
grant execute on function public.correct_admin_sale_with_inventory(uuid, text, text, text, text, jsonb, integer, integer, integer, text, text, integer, integer, jsonb) to service_role;
grant execute on function public.delete_admin_sale_with_inventory(uuid, text, text) to service_role;

commit;
