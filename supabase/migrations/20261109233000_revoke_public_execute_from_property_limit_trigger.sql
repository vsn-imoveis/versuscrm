-- Trigger-only function: do not expose it as a callable PostgREST RPC.
revoke all on function public.enforce_crm_property_limits() from public;
revoke all on function public.enforce_crm_property_limits() from anon, authenticated;
