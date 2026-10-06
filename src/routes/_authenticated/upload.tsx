import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SignOutButton } from "@/components/SignOutButton";

export const Route = createFileRoute("/_authenticated/upload")({
  component: UploadPage,
  head: () => ({
    meta: [
      { title: "رفع مستند للمراجعة" },
      { name: "description", content: "بوابة رفع مستندات الخطط التربوية الفردية للمراجعة الإشرافية." },
      { property: "og:title", content: "رفع مستند للمراجعة" },
      { property: "og:description", content: "ارفع الخطة أو الوثيقة ليراجعها المشرف." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const input = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm";

function UploadPage() {
  const { user } = Route.useRouteContext();
  const [status, setStatus] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [learner, setLearner] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("profiles").select("approval_status").eq("id", user.id).maybeSingle().then(({ data }) => setStatus(data?.approval_status ?? "pending"));
  }, [user.id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setErr(null);
    const ext = file.name.split(".").pop() ?? "bin";
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const up = await supabase.storage.from("submissions").upload(path, file, file.type ? { contentType: file.type } : {});
    if (up.error) {
      setErr("تعذر رفع الملف. حاول مرة أخرى.");
      setBusy(false);
      return;
    }
    const { error } = await supabase.from("submissions").insert({
      uploader_id: user.id,
      file_path: path,
      file_name: file.name,
      learner_name: learner || null,
      note: note || null,
    });
    setBusy(false);
    if (error) setErr("تعذر حفظ الطلب.");
    else {
      setDone(true);
      setFile(null);
      setLearner("");
      setNote("");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">رفع مستند للمراجعة</h1>
          <SignOutButton className="text-sm text-muted-foreground underline" />
        </div>
        {status === null ? null : status !== "approved" ? (
          <p className="rounded-lg bg-muted p-4 text-sm">
            {status === "rejected" ? "تم رفض الحساب أو إيقافه. تواصل مع المشرف." : "حسابك بانتظار اعتماد المشرف. ستتمكن من رفع المستندات بعد الاعتماد."}
          </p>
        ) : done ? (
          <div className="space-y-3 text-center">
            <p className="rounded-lg bg-muted p-4 text-sm">تم استلام المستند بنجاح. شكراً لك.</p>
            <button className="text-sm text-primary underline" onClick={() => setDone(false)}>رفع مستند آخر</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <input className={input} type="file" required accept=".pdf,.docx,.txt" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <input className={input} placeholder="اسم المتعلم (اختياري)" value={learner} onChange={(e) => setLearner(e.target.value)} />
            <textarea className={input} rows={3} placeholder="ملاحظة للمشرف (اختياري)" value={note} onChange={(e) => setNote(e.target.value)} />
            <button disabled={busy || !file} className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
              {busy ? "جارٍ الرفع…" : "إرسال المستند"}
            </button>
            {err && <p className="text-sm text-destructive">{err}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
