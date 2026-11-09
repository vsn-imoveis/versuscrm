-- Structured property-level characteristics, kept separate from condominium amenities.
-- Apply only to the dedicated VersusCRM Supabase project.
alter table public.properties
  add column if not exists property_features jsonb not null default '[]'::jsonb;

comment on column public.properties.property_features is
  'Array of characteristics belonging to the individual property, not the condominium.';
