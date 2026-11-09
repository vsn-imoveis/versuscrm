-- Regras de integridade do Versus CRM. Aplicar no projeto Supabase do CRM.
alter table public.crm_companies add column if not exists max_photos_per_property integer not null default 35;
alter table public.crm_subscriptions add column if not exists photo_limit integer not null default 35;
alter table public.crm_subscriptions add column if not exists property_limit integer not null default 100;
alter table public.crm_companies add column if not exists status text not null default 'pending';

create unique index if not exists crm_companies_slug_unique on public.crm_companies (lower(slug));

alter table public.crm_companies drop constraint if exists crm_companies_slug_format;
alter table public.crm_companies add constraint crm_companies_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
alter table public.crm_companies drop constraint if exists crm_companies_required_contact;
alter table public.crm_companies add constraint crm_companies_required_contact check (length(trim(name)) > 0 and length(trim(contact_name)) > 0 and contact_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$');
alter table public.crm_companies drop constraint if exists crm_companies_limits;
alter table public.crm_companies add constraint crm_companies_limits check (max_properties > 0 and max_photos_per_property > 0);
alter table public.crm_companies drop constraint if exists crm_companies_account_status;
alter table public.crm_companies add constraint crm_companies_account_status check (status in ('pending','active','suspended','cancelled'));

alter table public.crm_subscriptions drop constraint if exists crm_subscriptions_limits;
alter table public.crm_subscriptions add constraint crm_subscriptions_limits check (monthly_price >= 0 and property_limit > 0 and photo_limit > 0);
alter table public.crm_subscriptions drop constraint if exists crm_subscriptions_status;
alter table public.crm_subscriptions add constraint crm_subscriptions_status check (status in ('trial','active','pending','past_due','cancelled'));

-- Impede que limites sejam alterados para além do que o administrador definiu no plano.
create or replace function public.validate_crm_subscription_limits()
returns trigger language plpgsql as $$
declare company_limit integer; company_photos integer;
begin
  select max_properties, max_photos_per_property into company_limit, company_photos from public.crm_companies where id = new.company_id;
  if company_limit is null then raise exception 'Empresa inválida'; end if;
  if new.property_limit <> company_limit or new.photo_limit <> company_photos then raise exception 'Limites devem ser definidos pelo administrador'; end if;
  return new;
end; $$;
drop trigger if exists crm_subscription_limits_guard on public.crm_subscriptions;
create trigger crm_subscription_limits_guard before insert or update on public.crm_subscriptions for each row execute function public.validate_crm_subscription_limits();

alter table public.crm_companies enable row level security;
alter table public.crm_subscriptions enable row level security;
