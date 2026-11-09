-- Tenant administrators may edit company branding and contact details,
-- but only platform administrators or trusted server-side service-role calls
-- may change tenant identity, activation status, or subscription-enforced limits.
CREATE OR REPLACE FUNCTION public.prevent_tenant_company_entitlement_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid;
  v_is_platform_admin boolean := false;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida para alterar dados da imobiliária.'
      USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = v_user_id
      AND p.role = 'admin'
  )
  INTO v_is_platform_admin;

  IF NOT v_is_platform_admin AND (
    NEW.slug IS DISTINCT FROM OLD.slug
    OR NEW.status IS DISTINCT FROM OLD.status
    OR NEW.max_properties IS DISTINCT FROM OLD.max_properties
    OR NEW.max_photos_per_property IS DISTINCT FROM OLD.max_photos_per_property
  ) THEN
    RAISE EXCEPTION 'Somente o administrador da plataforma pode alterar o slug, o status e os limites da imobiliária.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS protect_company_entitlements ON public.crm_companies;
CREATE TRIGGER protect_company_entitlements
BEFORE UPDATE ON public.crm_companies
FOR EACH ROW
EXECUTE FUNCTION public.prevent_tenant_company_entitlement_changes();

REVOKE EXECUTE ON FUNCTION public.prevent_tenant_company_entitlement_changes()
FROM PUBLIC, anon, authenticated;