-- Keep operational notifications inside the tenant that owns each request.
create or replace function public.notify_admin_on_crm_request_created()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  insert into public.crm_user_notifications
    (user_id, company_id, lead_request_id, title, message, entity_type, action, status)
  select m.user_id, new.company_id, new.id,
    'Novo lead pelo site',
    coalesce(new.contact_name, 'Um contato') || ' enviou uma nova solicitação: ' || coalesce(new.subject, 'Contato pelo site'),
    'crm_request', 'view_request:' || new.id::text, 'new'
  from public.crm_memberships m
  where m.company_id = new.company_id and m.role in ('owner','admin','manager');
  return new;
end;
$function$;

create or replace function public.notify_admin_on_catalog_request_created()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare
  v_item_name text;
  v_action_label text;
  v_entity_label text;
begin
  v_item_name := coalesce(nullif(new.proposed_data->>'name',''),nullif(new.current_data->>'name',''),'item sem nome');
  v_action_label := case new.action when 'create' then 'cadastrar' when 'update' then 'alterar' when 'delete' then 'excluir' else new.action end;
  v_entity_label := case new.entity_type when 'developer' then 'construtora' when 'condominium' then 'condomínio' else new.entity_type end;
  insert into public.crm_user_notifications
    (user_id, company_id, request_id, title, message, entity_type, action, status)
  select m.user_id, new.company_id, new.id,
    'Nova solicitação de catálogo',
    'Foi solicitada a ação de ' || v_action_label || ' em ' || v_entity_label || ': ' || v_item_name,
    'catalog_request', 'review_catalog_request', 'new'
  from public.crm_memberships m
  where m.company_id = new.company_id and m.role in ('owner','admin','manager');
  return new;
end;
$function$;

-- The request trigger is now the single notification source for public leads.
create or replace function public.register_public_crm_lead(
  p_slug text,p_name text,p_email text,p_phone text,p_interest text,p_property text,p_message text
)
returns uuid language plpgsql security definer set search_path = ''
as $function$
declare
  v_company_id uuid;
  v_request_id uuid;
  v_subject text;
  v_phone text;
begin
  if coalesce(length(trim(p_name)),0)=0 or coalesce(length(trim(p_email)),0)=0 or coalesce(length(trim(p_message)),0)=0 then
    raise exception 'Nome, e-mail e mensagem são obrigatórios';
  end if;
  if length(p_name)>160 or length(p_email)>254 or length(coalesce(p_phone,''))>50
     or length(coalesce(p_property,''))>500 or length(p_message)>5000 then
    raise exception 'Dados do lead excedem o limite permitido';
  end if;
  select c.id into v_company_id from public.crm_companies c
  where c.slug=lower(trim(p_slug)) and c.status='active' limit 1;
  if v_company_id is null then raise exception 'Imobiliária não encontrada ou inativa'; end if;
  v_phone := nullif(trim(coalesce(p_phone,'')),'');
  v_subject := coalesce(nullif(trim(p_interest),''),nullif(trim(coalesce(p_property,'')),''),'Novo contato pelo site');
  insert into public.crm_requests(company_id,contact_name,email,phone,request_type,subject,message,status,source)
  values(v_company_id,trim(p_name),lower(trim(p_email)),v_phone,'general',v_subject,trim(p_message),'new','site')
  returning id into v_request_id;
  insert into public.crm_leads(id,company_id,contact_name,email,phone,interest,message,status,source,source_url,created_at)
  values(v_request_id,v_company_id,trim(p_name),lower(trim(p_email)),v_phone,
    nullif(trim(coalesce(p_interest,'')),''),trim(p_message),'new','site',
    nullif(trim(coalesce(p_property,'')),''),now());
  insert into public.crm_contacts(company_id,name,email,phone,contact_type,source,notes,status)
  values(v_company_id,trim(p_name),lower(trim(p_email)),v_phone,'lead','Site',
    concat_ws(E'\n\n',nullif(trim(coalesce(p_interest,'')),''),nullif(trim(coalesce(p_property,'')),''),trim(p_message)),'new');
  return v_request_id;
end;
$function$;
revoke all on function public.register_public_crm_lead(text,text,text,text,text,text,text) from public;
grant execute on function public.register_public_crm_lead(text,text,text,text,text,text,text) to anon,authenticated;

-- Owners may manage photos only for properties assigned to their own contact.
create or replace function public.crm_can_manage_property_photo(p_company_id text,p_property_id text)
returns boolean language sql stable security definer set search_path = ''
as $function$
  select (select auth.uid()) is not null and exists (
    select 1 from public.properties p
    where p.id::text=p_property_id and p.company_id::text=p_company_id
      and (
        exists(select 1 from public.crm_memberships m where m.user_id=(select auth.uid()) and m.company_id=p.company_id)
        or exists(select 1 from public.crm_owner_accounts oa
          where oa.user_id=(select auth.uid()) and oa.company_id=p.company_id
            and oa.contact_id=p.owner_contact_id and oa.status='active')
      )
  );
$function$;
drop policy if exists crm_property_photos_update on storage.objects;
create policy crm_property_photos_update on storage.objects for update to authenticated
using (
  bucket_id='crm-property-photos' and array_length(storage.foldername(name),1)=2
  and public.crm_can_manage_property_photo((storage.foldername(name))[1],(storage.foldername(name))[2])
)
with check (
  bucket_id='crm-property-photos' and array_length(storage.foldername(name),1)=2
  and public.crm_can_manage_property_photo((storage.foldername(name))[1],(storage.foldername(name))[2])
);
