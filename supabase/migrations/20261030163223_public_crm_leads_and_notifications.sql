-- Public website leads for the dedicated VersusCRM database.
-- Store each lead as a CRM request + contact and notify every member of its tenant.

create or replace function public.register_public_crm_lead(
  p_slug text,
  p_name text,
  p_email text,
  p_phone text,
  p_interest text,
  p_property text,
  p_message text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_request_id uuid;
  v_subject text;
begin
  if coalesce(length(trim(p_name)), 0) = 0
     or coalesce(length(trim(p_email)), 0) = 0
     or coalesce(length(trim(p_message)), 0) = 0 then
    raise exception 'Nome, e-mail e mensagem são obrigatórios';
  end if;

  if length(p_name) > 160 or length(p_email) > 254
     or length(coalesce(p_phone, '')) > 50
     or length(coalesce(p_property, '')) > 500
     or length(p_message) > 5000 then
    raise exception 'Dados do lead excedem o limite permitido';
  end if;

  select c.id into v_company_id
  from public.crm_companies c
  where c.slug = lower(trim(p_slug)) and c.status = 'active'
  limit 1;

  if v_company_id is null then
    raise exception 'Imobiliária não encontrada ou inativa';
  end if;

  v_subject := coalesce(nullif(trim(p_interest), ''), nullif(trim(p_property), ''), 'Novo contato pelo site');

  insert into public.crm_requests
    (company_id, contact_name, email, phone, request_type, subject, message, status, source)
  values
    (v_company_id, trim(p_name), lower(trim(p_email)), nullif(trim(coalesce(p_phone, '')), ''),
     'general', v_subject, trim(p_message), 'new', 'site')
  returning id into v_request_id;

  insert into public.crm_contacts
    (company_id, name, email, phone, contact_type, source, notes, status)
  values
    (v_company_id, trim(p_name), lower(trim(p_email)), nullif(trim(coalesce(p_phone, '')), ''),
     'lead', 'Site', concat_ws(E'\n\n', nullif(trim(coalesce(p_interest, '')), ''),
       nullif(trim(coalesce(p_property, '')), ''), trim(p_message)), 'new');

  insert into public.crm_user_notifications
    (user_id, company_id, request_id, title, message, entity_type, action, status)
  select m.user_id, v_company_id, v_request_id,
    'Novo lead pelo site',
    trim(p_name) || ' solicitou contato pelo site.',
    'request',
    'open_lead',
    'new'
  from public.crm_memberships m
  where m.company_id = v_company_id;

  return v_request_id;
end;
$$;

revoke all on function public.register_public_crm_lead(text,text,text,text,text,text,text) from public;
grant execute on function public.register_public_crm_lead(text,text,text,text,text,text,text) to anon, authenticated;
