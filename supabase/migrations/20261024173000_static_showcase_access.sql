begin;

create table if not exists public.showcase_static_access (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default true,
  updated_by text not null check (char_length(btrim(updated_by)) between 3 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  view_count bigint not null default 0 check (view_count >= 0),
  last_viewed_at timestamptz
);

insert into public.showcase_static_access (id, enabled, updated_by)
values (1, true, 'system')
on conflict (id) do nothing;

alter table public.showcase_static_access enable row level security;
revoke all on table public.showcase_static_access from public, anon, authenticated;
grant select, insert, update on table public.showcase_static_access to service_role;

create or replace function public.set_showcase_static_access(
  p_enabled boolean,
  p_updated_by text
)
returns public.showcase_static_access
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_access public.showcase_static_access;
begin
  if p_enabled is null then
    raise exception 'El estado del acceso fijo es obligatorio.';
  end if;
  if char_length(btrim(p_updated_by)) not between 3 and 80 then
    raise exception 'Responsable del cambio inválido.';
  end if;

  insert into public.showcase_static_access (id, enabled, updated_by)
  values (1, p_enabled, btrim(p_updated_by))
  on conflict (id) do update
    set enabled = excluded.enabled,
        updated_by = excluded.updated_by,
        updated_at = now()
  returning * into v_access;

  return v_access;
end;
$$;

create or replace function public.record_static_showcase_view()
returns public.showcase_static_access
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_access public.showcase_static_access;
begin
  update public.showcase_static_access
  set view_count = view_count + 1,
      last_viewed_at = now()
  where id = 1
    and enabled = true
  returning * into v_access;

  return v_access;
end;
$$;

revoke all on function public.set_showcase_static_access(boolean, text)
  from public, anon, authenticated;
revoke all on function public.record_static_showcase_view()
  from public, anon, authenticated;
grant execute on function public.set_showcase_static_access(boolean, text)
  to service_role;
grant execute on function public.record_static_showcase_view()
  to service_role;

commit;
