-- Tenant membership role boundaries.
-- Global Versus administrators retain their existing full-access policy.
DROP POLICY IF EXISTS crm_memberships_admin_insert ON public.crm_memberships;
DROP POLICY IF EXISTS crm_memberships_admin_update ON public.crm_memberships;
DROP POLICY IF EXISTS crm_memberships_admin_delete ON public.crm_memberships;

CREATE POLICY crm_memberships_admin_insert
ON public.crm_memberships
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_crm_admin()
  OR (
    public.crm_is_company_owner(company_id)
    AND role IN ('admin','manager','agent','member')
  )
  OR (
    public.crm_is_company_admin(company_id)
    AND role IN ('manager','agent','member')
  )
);

CREATE POLICY crm_memberships_admin_update
ON public.crm_memberships
FOR UPDATE
TO authenticated
USING (
  public.is_crm_admin()
  OR (
    public.crm_is_company_owner(company_id)
    AND role <> 'owner'
  )
  OR (
    public.crm_is_company_admin(company_id)
    AND role IN ('manager','agent','member')
  )
)
WITH CHECK (
  public.is_crm_admin()
  OR (
    public.crm_is_company_owner(company_id)
    AND role IN ('admin','manager','agent','member')
  )
  OR (
    public.crm_is_company_admin(company_id)
    AND role IN ('manager','agent','member')
  )
);

CREATE POLICY crm_memberships_admin_delete
ON public.crm_memberships
FOR DELETE
TO authenticated
USING (
  public.is_crm_admin()
  OR (
    public.crm_is_company_owner(company_id)
    AND role <> 'owner'
  )
  OR (
    public.crm_is_company_admin(company_id)
    AND role IN ('manager','agent','member')
  )
);
