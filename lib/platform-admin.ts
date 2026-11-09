import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function requirePlatformAdmin() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profile, error } = await supabase
    .from("profiles").select("role, full_name").eq("id", user.id).maybeSingle();

  if (error || profile?.role !== "admin") redirect("/");
  return { supabase, user, profile };
}
