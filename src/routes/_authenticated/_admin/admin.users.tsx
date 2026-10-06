import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/_admin/admin/users")({
  component: UsersPage,
  head: () => ({
    meta: [
      { title: "إدارة المستخدمين" },
      { name: "description", content: "اعتماد أو رفض حسابات رافعي المستندات." },
      { property: "og:title", content: "إدارة المستخدمين" },
      { property: "og:description", content: "اعتماد حسابات رافعي المستندات." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type P = { id: string; email: string | null; approval_status: string; created_at: string };
const LABEL: Record<string, string> = { pending: "بانتظار الاعتماد", approved: "معتمد", rejected: "مرفوض / موقوف" };
const btn = "rounded-lg border border-input px-3 py-1.5 text-xs hover:bg-accent";

function UsersPage() {
  const { user } = Route.useRouteContext();
  const [rows, setRows] = useState<P[]>([]);
  const load = () =>
    supabase.from("profiles").select("id,email,approval_status,created_at").order("created_at", { ascending: false }).then(({ data }) => setRows((data as P[]) ?? []));
  useEffect(() => void load(), []);
  const set = async (id: string, s: string) => {
    await supabase.from("profiles").update({ approval_status: s }).eq("id", id);
    load();
  };
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">المستخدمون</h1>
        <Link to="/" className={btn}>العودة للمراجعة</Link>
      </div>
      <table className="w-full text-sm">
        <thead><tr className="border-b text-right"><th className="p-2">البريد</th><th className="p-2">الحالة</th><th className="p-2">التاريخ</th><th className="p-2" /></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b">
              <td className="p-2">{r.email}</td>
              <td className="p-2">{r.id === user.id ? "المشرف" : LABEL[r.approval_status]}</td>
              <td className="p-2">{new Date(r.created_at).toLocaleDateString("ar")}</td>
              <td className="flex gap-2 p-2">
                {r.id !== user.id && (
                  <>
                    {r.approval_status !== "approved" && <button className={btn} onClick={() => set(r.id, "approved")}>اعتماد</button>}
                    {r.approval_status !== "rejected" && <button className={btn} onClick={() => set(r.id, "rejected")}>رفض / إيقاف</button>}
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
