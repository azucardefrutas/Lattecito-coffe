begin;

alter table public.inventory_recipes
  drop constraint if exists inventory_recipes_size_index_check;

alter table public.inventory_recipes
  add constraint inventory_recipes_size_index_check
  check (size_index >= -1 and size_index <= 9);

create or replace function public.save_catalog_with_sizes(
  p_catalog jsonb,
  p_expected_version bigint
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_version bigint;
  v_old_sizes jsonb;
  v_new_sizes jsonb;
  v_old_length integer;
  v_new_length integer;
  v_removed_index integer := null;
  v_index integer;
  v_saved_version bigint;
begin
  select version, coalesce(catalog -> 'sizes', '["Chico", "Mediano", "Grande"]'::jsonb)
    into v_version, v_old_sizes
  from public.catalog_state
  where id = 1
  for update;

  if v_version is null or v_version <> p_expected_version then
    return null;
  end if;

  v_new_sizes := p_catalog -> 'sizes';
  if jsonb_typeof(v_new_sizes) <> 'array' then
    raise exception 'Los tamaños del catálogo no son válidos.';
  end if;
  v_old_length := jsonb_array_length(v_old_sizes);
  v_new_length := jsonb_array_length(v_new_sizes);
  if v_new_length < 1 or v_new_length > 10 then
    raise exception 'El catálogo debe tener entre uno y diez tamaños.';
  end if;

  if v_new_length = v_old_length - 1 then
    for v_index in 0..v_old_length - 1 loop
      if v_old_sizes - v_index = v_new_sizes then
        v_removed_index := v_index;
        exit;
      end if;
    end loop;
    if v_removed_index is null then
      raise exception 'Elimina un solo tamaño antes de guardar otro cambio.';
    end if;

    delete from public.inventory_recipes
    where target_type = 'product' and size_index = v_removed_index;

    if v_removed_index < v_old_length - 1 then
      for v_index in v_removed_index + 1..v_old_length - 1 loop
        update public.inventory_recipes
        set size_index = v_index - 1
        where target_type = 'product' and size_index = v_index;
      end loop;
    end if;

    update public.product_costs
    set costs = costs - v_removed_index,
        updated_at = now();
  elsif v_new_length = v_old_length + 1 then
    if v_new_sizes - (v_new_length - 1) <> v_old_sizes then
      raise exception 'Agrega un solo tamaño al final de la lista.';
    end if;
    update public.product_costs
    set costs = costs || '[0]'::jsonb,
        updated_at = now();
  elsif v_new_length <> v_old_length then
    raise exception 'Agrega o elimina un tamaño a la vez.';
  end if;

  update public.catalog_state
  set catalog = p_catalog,
      version = version + 1,
      updated_at = now()
  where id = 1 and version = p_expected_version
  returning version into v_saved_version;

  return v_saved_version;
end;
$$;

revoke all on function public.save_catalog_with_sizes(jsonb, bigint) from public, anon, authenticated;
grant execute on function public.save_catalog_with_sizes(jsonb, bigint) to service_role;

commit;
