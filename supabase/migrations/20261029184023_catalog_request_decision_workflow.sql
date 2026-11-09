create or replace function public.decide_catalog_change_request(p_request_id uuid, p_approve boolean, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.crm_catalog_change_requests%rowtype;
  payload jsonb;
  target_table text;
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') then
    raise exception 'Apenas administrador pode decidir solicitações.';
  end if;
  select * into req from public.crm_catalog_change_requests where id = p_request_id for update;
  if not found then raise exception 'Solicitação não encontrada.'; end if;
  if req.status <> 'pending' then raise exception 'Esta solicitação já foi decidida.'; end if;

  if p_approve then
    target_table := case req.entity_type when 'developer' then 'crm_developers' when 'condominium' then 'crm_condominiums' else null end;
    payload := req.proposed_data;
    if req.action = 'create' then
      if req.entity_type = 'developer' then
        insert into public.crm_developers(company_id,name,legal_name,document,phone,website,partnership_manager_name,partnership_manager_phone,description,logo_url,active,created_by)
        values(req.company_id, payload->>'name', payload->>'legal_name', payload->>'document', payload->>'phone', payload->>'website', payload->>'partnership_manager_name', payload->>'partnership_manager_phone', payload->>'description', payload->>'logo_url', coalesce((payload->>'active')::boolean,true), req.requested_by);
      else
        insert into public.crm_condominiums(company_id,name,address,neighborhood,city,state,construction_year,builder,details)
        values(req.company_id, payload->>'name', payload->>'address', payload->>'neighborhood', payload->>'city', payload->>'state', nullif(payload->>'construction_year','')::integer, payload->>'builder', coalesce(payload->'details','{}'::jsonb));
      end if;
    elsif req.action = 'update' then
      if req.record_id is null then raise exception 'Registro alvo ausente.'; end if;
      if req.entity_type = 'developer' then
        update public.crm_developers set name=payload->>'name', legal_name=payload->>'legal_name', document=payload->>'document', phone=payload->>'phone', website=payload->>'website', partnership_manager_name=payload->>'partnership_manager_name', partnership_manager_phone=payload->>'partnership_manager_phone', description=payload->>'description', logo_url=payload->>'logo_url', active=coalesce((payload->>'active')::boolean,true), updated_at=now() where id=req.record_id;
      else
        update public.crm_condominiums set name=payload->>'name', address=payload->>'address', neighborhood=payload->>'neighborhood', city=payload->>'city', state=payload->>'state', construction_year=nullif(payload->>'construction_year','')::integer, builder=payload->>'builder', details=coalesce(payload->'details','{}'::jsonb), updated_at=now() where id=req.record_id;
      end if;
    elsif req.action = 'delete' then
      if req.record_id is null then raise exception 'Registro alvo ausente.'; end if;
      if req.entity_type = 'developer' then delete from public.crm_developers where id=req.record_id;
      else delete from public.crm_condominiums where id=req.record_id;
      end if;
    end if;
  end if;
  update public.crm_catalog_change_requests set status=case when p_approve then 'approved' else 'rejected' end, decision_by=auth.uid(), decision_at=now(), decision_note=nullif(trim(coalesce(p_note,'')),''), updated_at=now() where id=p_request_id;
  return jsonb_build_object('id',p_request_id,'status',case when p_approve then 'approved' else 'rejected' end);
end;
$$;
revoke all on function public.decide_catalog_change_request(uuid,boolean,text) from public;
grant execute on function public.decide_catalog_change_request(uuid,boolean,text) to authenticated;
