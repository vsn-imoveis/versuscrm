create or replace function public.assign_crm_property_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  last_number bigint;
  v_prefix text;
  v_slug text;
begin
  if new.company_id is null then
    raise exception 'Imobiliária obrigatória para gerar o código do imóvel';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.company_id::text || ':property-code', 0)
  );

  select c.slug into v_slug
  from public.crm_companies c
  where c.id = new.company_id;

  if v_slug is null then
    raise exception 'Imobiliária não encontrada para gerar o código do imóvel';
  end if;

  v_prefix := case
    when lower(v_slug) = 'vsn-imoveis' then 'VSN'
    else left(coalesce(nullif(pg_catalog.regexp_replace(upper(v_slug), '[^A-Z0-9]', '', 'g'), ''), 'IMOB'), 8)
  end;

  new.code := nullif(btrim(new.code), '');

  if new.code is null then
    select coalesce(max((pg_catalog.regexp_match(upper(p.code), '^' || v_prefix || '([0-9]+)$'))[1]::bigint), 0)
      into last_number
      from public.properties p
     where p.company_id = new.company_id
       and upper(p.code) ~ ('^' || v_prefix || '[0-9]+$')
       and p.id <> new.id;

    new.code := v_prefix || lpad((last_number + 1)::text, 4, '0');
  end if;

  if exists (
    select 1
      from public.properties p
     where p.company_id = new.company_id
       and lower(p.code) = lower(new.code)
       and p.id <> new.id
  ) then
    raise exception 'Já existe um imóvel com o código % nesta imobiliária', new.code;
  end if;

  return new;
end;
$function$;