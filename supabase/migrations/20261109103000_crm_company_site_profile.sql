-- Tenant-specific public site profile fields used by the imported VSN profile screen.
alter table public.crm_companies
  add column if not exists whatsapp text,
  add column if not exists creci text;
