-- Restrict trigger-only SECURITY DEFINER functions and pin safe search paths.
-- Trigger execution does not require application roles to have direct EXECUTE access.
ALTER FUNCTION public.decide_catalog_change_request(uuid, boolean, text) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.decide_catalog_change_request(uuid, boolean, text) FROM anon;

ALTER FUNCTION public.notify_admin_on_catalog_request_created() SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.notify_admin_on_catalog_request_created() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.notify_admin_on_crm_request_created() SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.notify_admin_on_crm_request_created() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.notify_broker_on_crm_request_reply() SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.notify_broker_on_crm_request_reply() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.notify_catalog_requester_decision() SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.notify_catalog_requester_decision() FROM PUBLIC, anon, authenticated;