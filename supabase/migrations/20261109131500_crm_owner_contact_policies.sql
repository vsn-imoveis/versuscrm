create policy crm_contacts_owner_select on public.crm_contacts for select to authenticated using (
 exists(select 1 from public.crm_owner_accounts oa where oa.user_id=auth.uid() and oa.company_id=crm_contacts.company_id and oa.contact_id=crm_contacts.id and oa.status='active')
);
create policy crm_contacts_owner_update on public.crm_contacts for update to authenticated using (
 exists(select 1 from public.crm_owner_accounts oa where oa.user_id=auth.uid() and oa.company_id=crm_contacts.company_id and oa.contact_id=crm_contacts.id and oa.status='active')
) with check (
 exists(select 1 from public.crm_owner_accounts oa where oa.user_id=auth.uid() and oa.company_id=crm_contacts.company_id and oa.contact_id=crm_contacts.id and oa.status='active')
);