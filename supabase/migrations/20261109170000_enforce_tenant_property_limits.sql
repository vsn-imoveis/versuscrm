-- Enforce each tenant's configured subscription limits at the database boundary.
-- The advisory lock serializes concurrent inserts for the same company so two requests
-- cannot both pass the property-count check at the same time.
create or replace function public.enforce_crm_property_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_limit integer;
  v_subscription_limit integer;
  v_photo_limit integer;
  v_current_count bigint;
begin
  if new.company_id is null then
    raise exception 'O imóvel precisa estar vinculado a uma imobiliária.'
      using errcode = '23502';
  end if;

  select c.max_properties, c.max_photos_per_property
    into v_company_limit, v_photo_limit
  from public.crm_companies c
  where c.id = new.company_id
  for update;

  if not found then
    raise exception 'Imobiliária não encontrada.'
      using errcode = '23503';
  end if;

  select s.property_limit, least(
    coalesce(v_photo_limit, 35),
    coalesce(s.photo_limit, 35)
  )
    into v_subscription_limit, v_photo_limit
  from public.crm_subscriptions s
  where s.company_id = new.company_id
    and s.status in ('active', 'trial')
  limit 1;

  v_photo_limit := greatest(0, coalesce(v_photo_limit, 35));

  if coalesce(cardinality(new.photos), 0) > v_photo_limit then
    raise exception 'O plano desta imobiliária permite no máximo % fotos por imóvel.', v_photo_limit
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtextextended(new.company_id::text, 731942));

    select count(*) into v_current_count
    from public.properties p
    where p.company_id = new.company_id;

    if v_current_count >= greatest(0, least(
      coalesce(v_company_limit, 100),
      coalesce(v_subscription_limit, v_company_limit, 100)
    )) then
      raise exception 'O limite de imóveis do plano foi atingido (%).', least(
        coalesce(v_company_limit, 100),
        coalesce(v_subscription_limit, v_company_limit, 100)
      )
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_crm_property_limits on public.properties;
create trigger trg_enforce_crm_property_limits
before insert or update of company_id, photos
on public.properties
for each row
execute function public.enforce_crm_property_limits();

comment on function public.enforce_crm_property_limits() is
'Enforces tenant-specific property and photo limits from crm_companies and active/trial crm_subscriptions.';
