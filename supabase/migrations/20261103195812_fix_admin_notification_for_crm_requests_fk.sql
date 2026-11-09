create or replace function public.notify_admin_on_crm_request_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_name text;
  v_admin record;
begin
  select name into v_company_name from public.crm_companies where id = new.company_id;
  for v_admin in select p.id from public.profiles p where p.role = 'admin'
  loop
    insert into public.crm_user_notifications
      (user_id, company_id, request_id, title, message, entity_type, action, status)
    values
      (v_admin.id, null, null,
       'Nova solicitação de cliente',
       coalesce(v_company_name, 'Uma imobiliária') || ' recebeu uma nova solicitação: ' || coalesce(new.subject, 'Sem assunto') || ' · ' || coalesce(new.contact_name, 'Contato não informado') || ' · ID: ' || new.id::text,
       'crm_request', 'view_request:' || new.id::text, 'new');
  end loop;
  return new;
end;
$$;