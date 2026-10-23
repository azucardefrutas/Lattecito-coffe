begin;

create table if not exists public.gallery_items (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique
    check (char_length(storage_path) between 8 and 240 and storage_path !~ '(^|/)\.\.(/|$)'),
  title text not null
    check (char_length(btrim(title)) between 2 and 120),
  description text not null default ''
    check (char_length(description) <= 500),
  alt_text text not null
    check (char_length(btrim(alt_text)) between 3 and 180),
  category text not null default 'otro'
    check (category in ('local', 'bebidas', 'alimentos', 'equipo', 'eventos', 'otro')),
  width integer not null check (width between 1 and 10000),
  height integer not null check (height between 1 and 10000),
  sort_order integer not null default 0 check (sort_order between 0 and 1000000),
  published boolean not null default true,
  created_by text not null check (char_length(btrim(created_by)) between 3 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists gallery_items_public_order_idx
  on public.gallery_items (sort_order, created_at desc)
  where published = true;

alter table public.gallery_items enable row level security;
revoke all on table public.gallery_items from public, anon, authenticated;
grant select, insert, update, delete on table public.gallery_items to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gallery-images',
  'gallery-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

commit;
