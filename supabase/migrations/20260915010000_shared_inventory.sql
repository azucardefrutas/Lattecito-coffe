begin;

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 100),
  unit text not null check (unit in ('g', 'ml', 'pieza')),
  stock numeric(14,3) not null default 0 check (stock >= 0),
  minimum numeric(14,3) not null default 0 check (minimum >= 0),
  cost_per_unit integer not null default 0 check (cost_per_unit >= 0),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_recipes (
  target_type text not null check (target_type in ('product', 'modifier')),
  target_id text not null check (char_length(target_id) between 1 and 80),
  size_index smallint not null check (size_index between -1 and 2),
  ingredients jsonb not null default '[]'::jsonb check (jsonb_typeof(ingredients) = 'array'),
  updated_at timestamptz not null default now(),
  primary key (target_type, target_id, size_index),
  check ((target_type = 'modifier' and size_index = -1) or target_type = 'product')
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity <> 0),
  reason text not null check (char_length(btrim(reason)) between 2 and 300),
  movement_type text not null check (movement_type in ('entry', 'adjustment', 'sale')),
  resulting_stock numeric(14,3) not null check (resulting_stock >= 0),
  sale_id uuid references public.admin_sales(id) on delete restrict,
  created_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists inventory_movements_item_date_idx
  on public.inventory_movements (item_id, created_at desc);
create index if not exists inventory_movements_date_idx
  on public.inventory_movements (created_at desc);

alter table public.inventory_items enable row level security;
alter table public.inventory_recipes enable row level security;
alter table public.inventory_movements enable row level security;

revoke all on table public.inventory_items from anon, authenticated;
revoke all on table public.inventory_recipes from anon, authenticated;
revoke all on table public.inventory_movements from anon, authenticated;
grant select, insert, update, delete on table public.inventory_items to service_role;
grant select, insert, update, delete on table public.inventory_recipes to service_role;
grant select, insert, update, delete on table public.inventory_movements to service_role;

create or replace function public.adjust_inventory_stock(
  p_item_id uuid,
  p_quantity numeric,
  p_reason text,
  p_created_by text
) returns public.inventory_items
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item public.inventory_items;
  v_next numeric(14,3);
  v_type text;
begin
  if p_quantity = 0 or abs(p_quantity) > 100000 or scale(p_quantity) > 3 then
    raise exception 'Cantidad de inventario inválida.';
  end if;
  if char_length(btrim(p_reason)) not between 2 and 300 then
    raise exception 'Indica el motivo del movimiento.';
  end if;
  select * into v_item from public.inventory_items where id = p_item_id for update;
  if not found then raise exception 'Insumo no encontrado.'; end if;
  if v_item.unit = 'pieza' and p_quantity <> trunc(p_quantity) then
    raise exception 'Las piezas deben registrarse en cantidades enteras.';
  end if;
  v_next := v_item.stock + p_quantity;
  if v_next < 0 then raise exception 'El inventario no puede quedar negativo.'; end if;
  v_type := case when p_quantity > 0 then 'entry' else 'adjustment' end;
  update public.inventory_items
    set stock = v_next, updated_at = now()
    where id = p_item_id returning * into v_item;
  insert into public.inventory_movements
    (item_id, quantity, reason, movement_type, resulting_stock, created_by)
  values (p_item_id, p_quantity, btrim(p_reason), v_type, v_next, p_created_by);
  return v_item;
end;
$$;

create or replace function public.create_admin_sale_with_inventory(
  p_id uuid,
  p_created_by text,
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
  v_existing public.admin_sales;
  v_sale public.admin_sales;
  v_need record;
  v_item public.inventory_items;
  v_next numeric(14,3);
begin
  select * into v_existing from public.admin_sales where id = p_id;
  if found then return v_existing; end if;
  if jsonb_typeof(p_consumption) <> 'array' then
    raise exception 'Consumo de inventario inválido.';
  end if;

  for v_need in
    select (value->>'itemId')::uuid as item_id, (value->>'quantity')::numeric as quantity
    from jsonb_array_elements(p_consumption)
    order by (value->>'itemId')::uuid
  loop
    if v_need.quantity <= 0 or v_need.quantity > 100000 or scale(v_need.quantity) > 3 then
      raise exception 'Cantidad de receta inválida.';
    end if;
    select * into v_item from public.inventory_items where id = v_need.item_id and active for update;
    if not found then raise exception 'La receta contiene un insumo inactivo o inexistente.'; end if;
    if v_item.unit = 'pieza' and v_need.quantity <> trunc(v_need.quantity) then
      raise exception 'Las piezas deben consumirse en cantidades enteras.';
    end if;
    if v_item.stock < v_need.quantity then
      raise exception 'Insumo insuficiente: %.', v_item.name;
    end if;
  end loop;

  insert into public.admin_sales
    (id, created_by, customer, note, items, subtotal, total, cost,
     payment_method, payment_status, received, change)
  values
    (p_id, p_created_by, p_customer, p_note, p_items, p_subtotal, p_total, p_cost,
     p_payment_method, p_payment_status, p_received, p_change)
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
      (v_need.item_id, -v_need.quantity, 'Venta #' || v_sale.order_number,
       'sale', v_next, v_sale.id, p_created_by);
  end loop;
  return v_sale;
end;
$$;

revoke all on function public.adjust_inventory_stock(uuid, numeric, text, text) from public, anon, authenticated;
revoke all on function public.create_admin_sale_with_inventory(uuid, text, text, text, jsonb, integer, integer, integer, text, text, integer, integer, jsonb) from public, anon, authenticated;
grant execute on function public.adjust_inventory_stock(uuid, numeric, text, text) to service_role;
grant execute on function public.create_admin_sale_with_inventory(uuid, text, text, text, jsonb, integer, integer, integer, text, text, integer, integer, jsonb) to service_role;

commit;
