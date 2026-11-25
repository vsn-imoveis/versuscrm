-- Permissões individuais por imobiliária, isoladas por empresa.
-- O acesso de leitura e escrita ocorre exclusivamente pela Edge Function admin-actions,
-- que valida o vínculo owner/admin antes de consultar ou alterar os registros.
create table if not exists public.crm_membership_permissions (
  company_id uuid not null,
  user_id uuid not null,
  permission_key text not null,
  allowed boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, user_id, permission_key),
  constraint crm_membership_permissions_membership_fk
    foreign key (company_id, user_id)
    references public.crm_memberships (company_id, user_id)
    on delete cascade
);

create index if not exists crm_membership_permissions_company_user_idx
  on public.crm_membership_permissions (company_id, user_id);

alter table public.crm_membership_permissions enable row level security;
revoke all on table public.crm_membership_permissions from anon, authenticated;
grant all on table public.crm_membership_permissions to service_role;
