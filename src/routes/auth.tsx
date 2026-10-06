import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  head: () => ({
    meta: [
      { title: "تسجيل الدخول — محرك مراجعة الخطط التربوية الفردية" },
      { name: "description", content: "تسجيل الدخول إلى محرك المراجعة الإشرافية أو بوابة رفع المستندات." },
      { property: "og:title", content: "تسجيل الدخول — محرك مراجعة الخطط التربوية" },
      { property: "og:description", content: "دخول المشرف أو رافع المستندات." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const input = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm";
const btn = "w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/" });
    });
    const { data } = supabase.auth.onAuthStateChange((e, s) => {
      if (e === "SIGNED_IN" && s) navigate({ to: "/" });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMsg("البريد أو كلمة المرور غير صحيحة.");
    } else {
      const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
      setMsg(error ? error.message : "تم إنشاء الحساب. افتح بريدك لتأكيده، ثم انتظر اعتماد المشرف.");
    }
    setBusy(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
        <h1 className="text-center text-lg font-bold">{mode === "in" ? "تسجيل الدخول" : "إنشاء حساب"}</h1>
        <form onSubmit={submit} className="space-y-3">
          <input className={input} type="email" required placeholder="البريد الإلكتروني" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className={input} type="password" required minLength={6} placeholder="كلمة المرور" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className={btn} disabled={busy}>{mode === "in" ? "دخول" : "إنشاء الحساب"}</button>
        </form>
        <button
          className="w-full rounded-lg border border-input px-4 py-2 text-sm hover:bg-accent"
          onClick={() => lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin })}
        >
          الدخول بحساب Google
        </button>
        {msg && <p className="text-center text-sm text-muted-foreground">{msg}</p>}
        <button className="w-full text-sm text-primary underline" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "ليس لديك حساب؟ أنشئ حساباً" : "لديك حساب؟ سجّل الدخول"}
        </button>
      </div>
    </div>
  );
}
