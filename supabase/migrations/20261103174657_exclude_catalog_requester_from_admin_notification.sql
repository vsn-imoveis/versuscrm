create or replace function public.notify_admin_on_catalog_request_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_name text;
  v_item_name text;
  v_action_label text;
  v_entity_label text;
begin
  select name into v_company_name
  from public.crm_companies
  where id = new.company_id;

  v_item_name := coalesce(
    nullif(new.proposed_data->>'name',''),
    nullif(new.current_data->>'name',''),
    'item sem nome'
  );

  v_action_label := case new.action
    when 'create' then 'cadastrar'
    when 'update' then 'alterar'
    when 'delete' then 'excluir'
    else new.action
  end;

  v_entity_label := case new.entity_type
    when 'developer' then 'construtora'
    when 'condominium' then 'condomínio'
    else new.entity_type
  end;

  insert into public.crm_user_notifications
    (user_id, company_id, request_id, title, message, entity_type, action, status)
  select p.id, null, new.id,
    'Nova solicitação de catálogo',
    coalesce(v_company_name, 'Uma imobiliária') || ' solicitou ' || v_action_label || ' ' || v_entity_label || ': ' || v_item_name,
    'catalog_request',
    'review_catalog_request',
    'new'
  from public.profiles p
  where p.role = 'admin'
    and p.id <> new.requested_by;

  return new;
end;
$$;

drop trigger if exists trg_notify_admin_catalog_request_created on public.crm_catalog_change_requests;
create trigger trg_notify_admin_catalog_request_created
after insert on public.crm_catalog_change_requests
for each row
execute function public.notify_admin_on_catalog_request_created();