-- A tenant user may edit their own personal profile fields, never their platform role.
revoke update on table public.profiles from authenticated;
grant update (
  full_name,
  phone,
  cpf_cnpj,
  creci,
  company,
  bio,
  avatar_url,
  updated_at
) on table public.profiles to authenticated;
