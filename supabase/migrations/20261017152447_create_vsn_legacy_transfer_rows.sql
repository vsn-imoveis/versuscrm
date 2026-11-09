create table if not exists public.vsn_legacy_import_rows (
  source_table text not null,
  source_key text not null,
  row_data jsonb not null,
  imported_at timestamptz not null default now(),
  primary key (source_table, source_key)
);
alter table public.vsn_legacy_import_rows enable row level security;
revoke all on table public.vsn_legacy_import_rows from public, anon, authenticated;