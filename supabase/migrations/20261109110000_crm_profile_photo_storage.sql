-- User-owned profile avatars for the Versus CRM.
insert into storage.buckets (id, name, public)
values ('crm-profile-photos', 'crm-profile-photos', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'crm_profile_photos_user_insert'
  ) then
    create policy crm_profile_photos_user_insert on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'crm-profile-photos'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'crm_profile_photos_user_update'
  ) then
    create policy crm_profile_photos_user_update on storage.objects
      for update to authenticated
      using (
        bucket_id = 'crm-profile-photos'
        and (storage.foldername(name))[1] = auth.uid()::text
      )
      with check (
        bucket_id = 'crm-profile-photos'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'crm_profile_photos_user_delete'
  ) then
    create policy crm_profile_photos_user_delete on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'crm-profile-photos'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end $$;
