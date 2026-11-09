alter table public.profiles
  add column if not exists phone text,
  add column if not exists cpf_cnpj text,
  add column if not exists creci text,
  add column if not exists company text,
  add column if not exists bio text;

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists crm_profile_photos_select_self on storage.objects;
create policy crm_profile_photos_select_self
  on storage.objects for select to authenticated
  using (bucket_id = 'crm-profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists crm_profile_photos_insert_self on storage.objects;
create policy crm_profile_photos_insert_self
  on storage.objects for insert to authenticated
  with check (bucket_id = 'crm-profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists crm_profile_photos_update_self on storage.objects;
create policy crm_profile_photos_update_self
  on storage.objects for update to authenticated
  using (bucket_id = 'crm-profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'crm-profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists crm_profile_photos_delete_self on storage.objects;
create policy crm_profile_photos_delete_self
  on storage.objects for delete to authenticated
  using (bucket_id = 'crm-profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists crm_site_assets_select_member on storage.objects;
create policy crm_site_assets_select_member
  on storage.objects for select to authenticated
  using (bucket_id = 'crm-site-assets' and exists (
    select 1 from public.crm_memberships m
    where m.user_id = (select auth.uid()) and m.company_id::text = (storage.foldername(name))[1]
  ));
