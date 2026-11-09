-- Lead ownership and immutable activity history for multi-tenant CRM.
alter table public.crm_leads
  add column if not exists assigned_to uuid references auth.users(id) on delete set null,
  add column if not exists assigned_by uuid references auth.users(id) on delete set null,
  add column if not exists assigned_at timestamptz;

create index if not exists crm_leads_company_assigned_created_idx
  on public.crm_leads (company_id, assigned_to, created_at desc);

create table if not exists public.crm_lead_activities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.crm_companies(id) on delete cascade,
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('created','assigned','unassigned','status_changed')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists crm_lead_activities_company_lead_created_idx
  on public.crm_lead_activities (company_id, lead_id, created_at desc);

alter table public.crm_lead_activities enable row level security;
revoke all on public.crm_lead_activities from anon, authenticated;
grant select on public.crm_lead_activities to authenticated;

drop policy if exists crm_lead_activities_tenant_select on public.crm_lead_activities;
create policy crm_lead_activities_tenant_select
  on public.crm_lead_activities
  for select to authenticated
  using (
    exists (
      select 1 from public.crm_memberships m
      where m.user_id = (select auth.uid())
        and m.company_id = crm_lead_activities.company_id
    )
  );

create or replace function public.crm_validate_lead_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assigned_to is not null and not exists (
    select 1 from public.crm_memberships m
    where m.company_id = new.company_id
      and m.user_id = new.assigned_to
  ) then
    raise exception 'O responsável precisa pertencer à mesma imobiliária do lead.'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' and new.assigned_to is not null then
    new.assigned_by := auth.uid();
    new.assigned_at := coalesce(new.assigned_at, now());
  elsif tg_op = 'UPDATE' and new.assigned_to is distinct from old.assigned_to then
    new.assigned_by := case when new.assigned_to is null then null else auth.uid() end;
    new.assigned_at := case when new.assigned_to is null then null else now() end;
  end if;
  return new;
end;
$$;

create or replace function public.crm_log_lead_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.crm_lead_activities(company_id, lead_id, actor_id, action, details)
    values (
      new.company_id, new.id, auth.uid(), 'created',
      jsonb_build_object('status', new.status, 'source', new.source)
    );
    if new.assigned_to is not null then
      insert into public.crm_lead_activities(company_id, lead_id, actor_id, action, details)
      values (
        new.company_id, new.id, auth.uid(), 'assigned',
        jsonb_build_object('assigned_to', new.assigned_to)
      );
    end if;
    return new;
  end if;

  if new.assigned_to is distinct from old.assigned_to then
    insert into public.crm_lead_activities(company_id, lead_id, actor_id, action, details)
    values (
      new.company_id, new.id, auth.uid(),
      case when new.assigned_to is null then 'unassigned' else 'assigned' end,
      jsonb_build_object('from', old.assigned_to, 'to', new.assigned_to)
    );
  end if;

  if new.status is distinct from old.status then
    insert into public.crm_lead_activities(company_id, lead_id, actor_id, action, details)
    values (
      new.company_id, new.id, auth.uid(), 'status_changed',
      jsonb_build_object('from', old.status, 'to', new.status)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists crm_leads_validate_assignment on public.crm_leads;
create trigger crm_leads_validate_assignment
  before insert or update of assigned_to, company_id
  on public.crm_leads
  for each row execute function public.crm_validate_lead_assignment();

drop trigger if exists crm_leads_activity_audit on public.crm_leads;
create trigger crm_leads_activity_audit
  after insert or update of assigned_to, status
  on public.crm_leads
  for each row execute function public.crm_log_lead_activity();

revoke all on function public.crm_validate_lead_assignment() from public, anon, authenticated;
revoke all on function public.crm_log_lead_activity() from public, anon, authenticated;
