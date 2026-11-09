-- Protect owner contact records from broker-level mutations.
-- Brokers may continue managing regular CRM contacts inside their own tenant.
-- Owner records and owner-contact creation are restricted to tenant management roles.

drop policy if exists crm_contacts_member_insert on public.crm_contacts;
create policy crm_contacts_member_insert on public.crm_contacts
for insert to authenticated with check (
  exists (select 1 from public.crm_memberships m
    where m.user_id=auth.uid() and m.company_id=crm_contacts.company_id)
  and (
    coalesce(contact_type,'') <> 'owner'
    or exists (select 1 from public.crm_memberships m
      where m.user_id=auth.uid() and m.company_id=crm_contacts.company_id
        and m.role in ('owner','admin','manager'))
  )
);

drop policy if exists crm_contacts_member_update on public.crm_contacts;
create policy crm_contacts_member_update on public.crm_contacts
for update to authenticated
using (
  exists (select 1 from public.crm_memberships m
    where m.user_id=auth.uid() and m.company_id=crm_contacts.company_id
      and (crm_contacts.contact_type <> 'owner' or m.role in ('owner','admin','manager')))
)
with check (
  exists (select 1 from public.crm_memberships m
    where m.user_id=auth.uid() and m.company_id=crm_contacts.company_id
      and (crm_contacts.contact_type <> 'owner' or m.role in ('owner','admin','manager')))
);

drop policy if exists crm_contacts_member_delete on public.crm_contacts;
create policy crm_contacts_member_delete on public.crm_contacts
for delete to authenticated using (
  exists (select 1 from public.crm_memberships m
    where m.user_id=auth.uid() and m.company_id=crm_contacts.company_id
      and (crm_contacts.contact_type <> 'owner' or m.role in ('owner','admin','manager')))
);
