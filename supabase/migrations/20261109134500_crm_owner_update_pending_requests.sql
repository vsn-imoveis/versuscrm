create policy crm_catalog_requests_owner_update on public.crm_catalog_change_requests
for update to authenticated using (
 requested_by=auth.uid() and status='pending' and entity_type='property'
 and exists (
  select 1 from public.crm_owner_accounts oa
  join public.properties p on p.company_id=oa.company_id and p.owner_contact_id=oa.contact_id
  where oa.user_id=auth.uid() and oa.status='active'
    and p.id=crm_catalog_change_requests.record_id
    and p.company_id=crm_catalog_change_requests.company_id
 )
) with check (
 requested_by=auth.uid() and status='pending' and entity_type='property'
 and exists (
  select 1 from public.crm_owner_accounts oa
  join public.properties p on p.company_id=oa.company_id and p.owner_contact_id=oa.contact_id
  where oa.user_id=auth.uid() and oa.status='active'
    and p.id=crm_catalog_change_requests.record_id
    and p.company_id=crm_catalog_change_requests.company_id
 )
);