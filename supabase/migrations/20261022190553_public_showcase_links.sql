begin;

create table if not exists public.showcase_links (
  id uuid primary key,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  view_count bigint not null default 0 check (view_count >= 0),
  last_viewed_at timestamptz,
  check (expires_at > created_at)
);

create index if not exists showcase_links_active_expiry_idx
  on public.showcase_links (expires_at desc)
  where revoked_at is null;

create index if not exists inventory_movements_sale_id_idx
  on public.inventory_movements (sale_id)
  where sale_id is not null;

alter table public.showcase_links enable row level security;
revoke all on table public.showcase_links from public, anon, authenticated;
grant select, insert, update, delete on table public.showcase_links to service_role;

create or replace function public.create_showcase_link(
  p_id uuid,
  p_token_hash text,
  p_expires_at timestamptz,
  p_created_by text
)
returns public.showcase_links
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_link public.showcase_links;
begin
  if p_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Token de lectura inválido.';
  end if;
  if p_expires_at <= now() or p_expires_at > now() + interval '180 days' then
    raise exception 'La vigencia debe estar entre uno y ciento ochenta días.';
  end if;

  update public.showcase_links
  set revoked_at = now()
  where revoked_at is null and expires_at > now();

  insert into public.showcase_links (id, token_hash, expires_at, created_by)
  values (p_id, p_token_hash, p_expires_at, btrim(p_created_by))
  returning * into v_link;

  return v_link;
end;
$$;

create or replace function public.record_showcase_view(p_token_hash text)
returns public.showcase_links
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_link public.showcase_links;
begin
  update public.showcase_links
  set view_count = view_count + 1,
      last_viewed_at = now()
  where token_hash = p_token_hash
    and revoked_at is null
    and expires_at > now()
  returning * into v_link;

  return v_link;
end;
$$;

revoke all on function public.create_showcase_link(uuid, text, timestamptz, text)
  from public, anon, authenticated;
revoke all on function public.record_showcase_view(text)
  from public, anon, authenticated;
grant execute on function public.create_showcase_link(uuid, text, timestamptz, text)
  to service_role;
grant execute on function public.record_showcase_view(text)
  to service_role;

commit;
