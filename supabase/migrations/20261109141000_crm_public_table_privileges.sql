-- Public visitors only need published property/launch reads and lead submission.
-- All other public-schema tables remain behind authenticated membership policies.
revoke all on all tables in schema public from anon;
grant select on table public.properties to anon;
grant select on table public.crm_launches to anon;
grant insert on table public.crm_leads to anon;
alter default privileges in schema public revoke all on tables from anon;
