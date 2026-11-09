insert into storage.buckets(id,name,public) values
 ('crm-property-photos','crm-property-photos',true),
 ('crm-site-assets','crm-site-assets',true)
on conflict(id) do nothing;

create policy crm_property_photos_insert on storage.objects for insert to authenticated with check (
 bucket_id='crm-property-photos' and exists (
  select 1 from public.properties p
  where p.id=(storage.foldername(name))[2]::uuid
    and p.company_id=(storage.foldername(name))[1]::uuid
    and (
      exists(select 1 from public.crm_memberships m where m.user_id=auth.uid() and m.company_id=p.company_id)
      or exists(select 1 from public.crm_owner_accounts oa where oa.user_id=auth.uid() and oa.company_id=p.company_id and oa.contact_id=p.owner_contact_id and oa.status='active')
    )
 )
);
create policy crm_property_photos_update on storage.objects for update to authenticated using (
 bucket_id='crm-property-photos' and exists (
  select 1 from public.properties p
  where p.id=(storage.foldername(name))[2]::uuid and p.company_id=(storage.foldername(name))[1]::uuid
    and exists(select 1 from public.crm_memberships m where m.user_id=auth.uid() and m.company_id=p.company_id)
 )
) with check (
 bucket_id='crm-property-photos' and exists (
  select 1 from public.properties p
  where p.id=(storage.foldername(name))[2]::uuid and p.company_id=(storage.foldername(name))[1]::uuid
    and exists(select 1 from public.crm_memberships m where m.user_id=auth.uid() and m.company_id=p.company_id)
 )
);
create policy crm_property_photos_delete on storage.objects for delete to authenticated using (
 bucket_id='crm-property-photos' and exists (
  select 1 from public.properties p
  where p.id=(storage.foldername(name))[2]::uuid and p.company_id=(storage.foldername(name))[1]::uuid
    and exists(select 1 from public.crm_memberships m where m.user_id=auth.uid() and m.company_id=p.company_id)
 )
);
create policy crm_site_assets_insert on storage.objects for insert to authenticated with check (
 bucket_id='crm-site-assets' and exists (
  select 1 from public.crm_memberships m
  where m.user_id=auth.uid() and m.company_id::text=(storage.foldername(name))[1]
 )
);
create policy crm_site_assets_update on storage.objects for update to authenticated using (
 bucket_id='crm-site-assets' and exists (
  select 1 from public.crm_memberships m
  where m.user_id=auth.uid() and m.company_id::text=(storage.foldername(name))[1]
 )
) with check (
 bucket_id='crm-site-assets' and exists (
  select 1 from public.crm_memberships m
  where m.user_id=auth.uid() and m.company_id::text=(storage.foldername(name))[1]
 )
);
create policy crm_site_assets_delete on storage.objects for delete to authenticated using (
 bucket_id='crm-site-assets' and exists (
  select 1 from public.crm_memberships m
  where m.user_id=auth.uid() and m.company_id::text=(storage.foldername(name))[1]
 )
);
