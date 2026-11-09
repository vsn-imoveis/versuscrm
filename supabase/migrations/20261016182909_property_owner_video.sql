-- Property owner contact and optional listing video URL.
-- Apply only to the dedicated VersusCRM Supabase project, never the legacy VSN database.
alter table public.properties
  add column if not exists video_url text,
  add column if not exists owner_contact_id uuid;

create unique index if not exists crm_contacts_id_company_unique
  on public.crm_contacts (id, company_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'properties_owner_contact_company_fkey'
  ) then
    alter table public.properties
      add constraint properties_owner_contact_company_fkey
      foreign key (owner_contact_id, company_id)
      references public.crm_contacts (id, company_id)
      on delete set null (owner_contact_id);
  end if;
end $$;

create index if not exists properties_company_owner_contact_idx
  on public.properties (company_id, owner_contact_id);

alter table public.properties
  drop constraint if exists properties_video_url_format;

alter table public.properties
  add constraint properties_video_url_format
  check (video_url is null or video_url ~* '^https?://');
