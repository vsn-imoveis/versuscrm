
-- Public website listings are readable without login, but authenticated CRM users
-- must only see their own tenant's records through tenant-scoped policies.
DROP POLICY IF EXISTS properties_public_read_published ON public.properties;
CREATE POLICY properties_public_read_published
ON public.properties
FOR SELECT
TO anon
USING (
  published = true
  AND company_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.crm_companies c
    WHERE c.id = properties.company_id
      AND c.status = 'active'
  )
);

DROP POLICY IF EXISTS crm_launches_public_select ON public.crm_launches;
CREATE POLICY crm_launches_public_select
ON public.crm_launches
FOR SELECT
TO anon
USING (
  published = true
  AND EXISTS (
    SELECT 1
    FROM public.crm_companies c
    WHERE c.id = crm_launches.company_id
      AND c.status = 'active'
  )
);

-- The public company lookup is intentionally available to anonymous website visitors.
-- Authenticated CRM users do not need to call it directly.
REVOKE EXECUTE ON FUNCTION public.get_public_crm_company(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_crm_company(text) TO anon;
