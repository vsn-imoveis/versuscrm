-- Allow owner portal property edit and publication requests.
-- The portal writes these request types to crm_catalog_change_requests.

alter table public.crm_catalog_change_requests
  drop constraint if exists crm_catalog_change_requests_entity_type_check;

alter table public.crm_catalog_change_requests
  add constraint crm_catalog_change_requests_entity_type_check
  check (entity_type = any (array[
    'developer'::text,
    'condominium'::text,
    'property'::text
  ]));

alter table public.crm_catalog_change_requests
  drop constraint if exists crm_catalog_change_requests_action_check;

alter table public.crm_catalog_change_requests
  add constraint crm_catalog_change_requests_action_check
  check (action = any (array[
    'create'::text,
    'update'::text,
    'delete'::text,
    'publish'::text,
    'unpublish'::text
  ]));
