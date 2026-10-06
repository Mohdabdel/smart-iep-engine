import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function SignOutButton({ className }: { className?: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  return (
    <button
      className={className}
      onClick={async () => {
        await qc.cancelQueries();
        qc.clear();
        await supabase.auth.signOut();
        navigate({ to: "/auth", replace: true });
      }}
    >
      تسجيل الخروج
    </button>
  );
}
