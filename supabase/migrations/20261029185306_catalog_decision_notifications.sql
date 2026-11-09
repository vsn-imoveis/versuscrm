create table if not exists public.crm_user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.crm_companies(id) on delete cascade,
  request_id uuid references public.crm_catalog_change_requests(id) on delete set null,
  title text not null,
  message text not null,
  entity_type text,
  action text,
  status text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.crm_user_notifications enable row level security;

drop policy if exists crm_user_notifications_select_own on public.crm_user_notifications;
create policy crm_user_notifications_select_own
on public.crm_user_notifications for select to authenticated
using (user_id = auth.uid());

drop policy if exists crm_user_notifications_update_own on public.crm_user_notifications;
create policy crm_user_notifications_update_own
on public.crm_user_notifications for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create index if not exists crm_user_notifications_user_created_idx
on public.crm_user_notifications(user_id, created_at desc);

create or replace function public.notify_catalog_requester_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entity text;
  v_action text;
  v_name text;
  v_status text;
  v_title text;
  v_message text;
begin
  if old.status is distinct from new.status and new.status in ('approved','rejected') then
    v_entity := case new.entity_type when 'developer' then 'construtora' else 'condomínio' end;
    v_action := case new.action when 'create' then 'cadastro' when 'update' then 'alteração' else 'exclusão' end;
    v_name := coalesce(new.proposed_data->>'name', new.current_data->>'name', 'registro');
    v_status := case new.status when 'approved' then 'aprovada' else 'recusada' end;
    v_title := 'Solicitação ' || v_status;
    v_message := 'Sua solicitação de ' || v_action || ' de ' || v_entity || ' "' || v_name || '" foi ' || v_status || '.';
    if nullif(trim(new.decision_note), '') is not null then
      v_message := v_message || ' Motivo: ' || trim(new.decision_note);
    end if;
    insert into public.crm_user_notifications(user_id, company_id, request_id, title, message, entity_type, action, status)
    values (new.requested_by, new.company_id, new.id, v_title, v_message, new.entity_type, new.action, new.status);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_catalog_requester_decision on public.crm_catalog_change_requests;
create trigger trg_notify_catalog_requester_decision
after update of status on public.crm_catalog_change_requests
for each row execute function public.notify_catalog_requester_decision();

grant select, update on public.crm_user_notifications to authenticated;