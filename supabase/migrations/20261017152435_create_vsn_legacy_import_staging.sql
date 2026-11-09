create schema if not exists migration_staging;
create table if not exists migration_staging.vsn_legacy_rows (
  source_table text not null,
  source_key text not null,
  row_data jsonb not null,
  imported_at timestamptz not null default now(),
  primary key (source_table, source_key)
);
revoke all on schema migration_staging from public, anon, authenticated;
revoke all on table migration_staging.vsn_legacy_rows from public, anon, authenticated;