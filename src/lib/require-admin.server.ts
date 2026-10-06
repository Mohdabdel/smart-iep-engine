// Verifies the request bearer token belongs to an admin. Returns a Response on failure.
export async function requireAdmin(request: Request): Promise<{ userId: string } | Response> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "يلزم تسجيل الدخول." }, { status: 401 });
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return Response.json({ error: "يلزم تسجيل الدخول." }, { status: 401 });
  const { data: role } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!role) return Response.json({ error: "غير مصرح." }, { status: 403 });
  return { userId: data.user.id };
}
