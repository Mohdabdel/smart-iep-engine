import { authHeaders } from "@/lib/auth-header";
/** طبقة الحفظ الدائم للمراجعات (أرشيف + أجزاء قابلة للاستكمال) — تُستدعى من المتصفح عبر /api/reviews */
import type { ReviewConfig } from "./criteria-registry";
import type { IepAuditReport } from "./iep-schema";

export const REVIEW_SPEC_VERSION = "supervisory-v5";
export type CaseStatus = "draft" | "running" | "partial" | "completed" | "approved" | "failed";
export type PartStatus = "pending" | "running" | "completed" | "failed";

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  draft: "مسودة",
  running: "قيد التنفيذ",
  partial: "مكتملة جزئياً",
  completed: "مكتملة",
  approved: "معتمدة",
  failed: "متعذرة",
};
export const PART_STATUS_LABELS: Record<PartStatus, string> = {
  pending: "قيد الانتظار",
  running: "جارٍ التنفيذ",
  completed: "مكتمل",
  failed: "تعذر التنفيذ",
};

const OWNER_KEY = "iep-audit:owner-key";
/** مفتاح خاص بهذا المتصفح — يحصر الأرشيف في هذا السياق ولا يُرسل إلا للخادم */
export function getOwnerKey() {
  let k = localStorage.getItem(OWNER_KEY);
  if (!k) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    k = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(OWNER_KEY, k);
  }
  return k;
}

async function call<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch("/api/reviews", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ action, owner_key: getOwnerKey(), ...payload }),
  });
  const j = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !j) throw new Error(j?.error ?? "تعذر الاتصال بالحفظ السحابي.");
  return j;
}

export type CaseSummary = {
  id: string;
  learner_name: string | null;
  source_file_name: string;
  review_type: string;
  status: CaseStatus;
  review_decision: string | null;
  created_at: string;
  updated_at: string;
};
export type StoredPart = { part_key: string; status: PartStatus; result_json: unknown; error_message: string | null; attempts: number };
export type StoredCase = CaseSummary & {
  review_config: ReviewConfig;
  report_sections: Record<string, boolean>;
  report_json: IepAuditReport | null;
  completed_at: string | null;
  approved_at: string | null;
};

export const createReviewCase = (p: {
  learner_name?: string | null;
  source_file_name: string;
  review_type: string;
  review_config: ReviewConfig;
  report_sections: Record<string, boolean>;
  part_keys: string[];
}) => call<{ id: string }>("create", { ...p, review_spec_version: REVIEW_SPEC_VERSION, report_schema_version: 4 }).then((r) => r.id);

export const saveReviewPart = (id: string, part_key: string, status: PartStatus, extra: { result_json?: unknown; error_message?: string; increment_attempts?: boolean } = {}) =>
  call("update_part", { id, part_key, status, ...extra });

export const updateReviewCase = (
  id: string,
  patch: { status?: CaseStatus; report_json?: unknown; review_decision?: string | null; learner_name?: string | null; report_sections?: Record<string, boolean> },
) => call("update_case", { id, ...patch });

export const saveEditedReport = (id: string, report: IepAuditReport) =>
  updateReviewCase(id, { report_json: report, review_decision: report.review_decision, learner_name: report.student_info.student_name || null });

export const listReviewCases = () => call<{ cases: CaseSummary[] }>("list").then((r) => r.cases);
export const loadReviewCase = (id: string) => call<{ case: StoredCase; parts: StoredPart[] }>("load", { id });
export const deleteReviewCase = (id: string) => call("delete", { id });

/** نصوص المستندات تُحفظ محلياً فقط لاستكمال مراجعة غير مكتملة (لا تُرسل إلى الأرشيف) */
const docsKey = (id: string) => `iep-audit:docs:${id}`;
export type CachedDocument = { source: string; name: string; text: string };
export function cacheCaseDocuments(id: string, docs: CachedDocument[]) {
  try {
    localStorage.setItem(docsKey(id), JSON.stringify(docs));
  } catch {
    /* quota — resume will ask for the file again */
  }
}
export function cachedCaseDocuments(id: string): CachedDocument[] | null {
  try {
    const raw = localStorage.getItem(docsKey(id));
    return raw ? (JSON.parse(raw) as CachedDocument[]) : null;
  } catch {
    return null;
  }
}
export function dropCaseDocuments(id: string) {
  try {
    localStorage.removeItem(docsKey(id));
  } catch {
    /* ignore */
  }
}
