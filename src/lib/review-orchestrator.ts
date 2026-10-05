/** تشغيل أجزاء المراجعة بصورة متحملة للفشل وقابلة للاستكمال — منطق نقي قابل للاختبار */
import type { ModelKey, ModelOutput } from "./iep-schema";
import type { CaseStatus, PartStatus } from "./review-store";

export type PartState = { key: string; keys: ModelKey[]; label: string; status: PartStatus; error?: string | undefined; attempts: number; result?: Partial<ModelOutput> | undefined };

export const partKey = (keys: ModelKey[]) => keys.join("+");

export function partLabel(keys: ModelKey[]) {
  if (keys.includes("goal_review")) return "مراجعة صياغة الأهداف";
  if (keys.includes("revisions")) return "التعديلات المقترحة (Before & After)";
  if (keys.includes("transition_coverage") || keys.includes("functional_contexts") || keys.includes("transition_minimum")) return "مفاهيم الانتقال والمواقف الوظيفية";
  if (keys.includes("needs_coverage") || keys.includes("whole_plan") || keys.includes("plaafp_assessment")) return "مستوى الأداء الحالي والرؤية الكلية";
  if (keys.includes("daily_routines") || keys.includes("personal_social") || keys.includes("vertical_alignment")) return "الروتين اليومي والجانب الشخصي";
  if (keys.includes("criteria_results")) return "معايير الجودة";
  if (keys.includes("plaafp_review") || keys.includes("smart_review") || keys.includes("recommendations")) return "الملاحظات والتوصيات والأولويات";
  return "بيانات الطالب والقرار";
}

export const initialParts = (buckets: ModelKey[][]): PartState[] =>
  buckets.map((keys) => ({ key: partKey(keys), keys, label: partLabel(keys), status: "pending", attempts: 0 }));

/** خطأ شبكة/اتصال قابل لإعادة المحاولة — بخلاف أخطاء التحقق أو المنطق */
export class RetriableError extends Error {
  retriable = true;
}
export const isRetriable = (e: unknown) => e instanceof RetriableError || e instanceof TypeError || (e as { retriable?: boolean })?.retriable === true;

export type PartStore = {
  save: (key: string, status: PartStatus, extra?: { result_json?: unknown; error_message?: string; increment_attempts?: boolean }) => Promise<unknown>;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * يشغّل فقط الأجزاء غير المكتملة (pending/failed) أو المحددة في `only`.
 * لا يعيد الأجزاء المكتملة، ولا يُسقط بقية الأجزاء عند فشل جزء.
 */
export async function runParts(opts: {
  parts: PartState[];
  run: (keys: ModelKey[]) => Promise<Partial<ModelOutput>>;
  store?: PartStore | null;
  onUpdate: (parts: PartState[]) => void;
  only?: string[] | undefined;
  backoffMs?: (attempt: number) => number;
}): Promise<PartState[]> {
  let parts = opts.parts.map((p) => ({ ...p }));
  const emit = () => opts.onUpdate(parts.map((p) => ({ ...p })));
  const patch = (key: string, p: Partial<PartState>) => {
    parts = parts.map((x) => (x.key === key ? { ...x, ...p } : x));
    emit();
  };
  const safeStore = async (...a: Parameters<PartStore["save"]>) => {
    try {
      await opts.store?.save(...a);
    } catch {
      /* الحفظ السحابي غير متاح — تستمر المراجعة محلياً */
    }
  };
  const backoff = opts.backoffMs ?? ((n: number) => 2000 * 2 ** (n - 1));
  const targets = parts.filter((p) => (opts.only ? opts.only.includes(p.key) : p.status !== "completed"));

  await Promise.allSettled(
    targets.map(async (t) => {
      let attempt = 0;
      for (;;) {
        attempt += 1;
        const attempts = (parts.find((p) => p.key === t.key)?.attempts ?? 0) + 1;
        patch(t.key, { status: "running", error: undefined, attempts });
        await safeStore(t.key, "running", { increment_attempts: true });
        try {
          const result = await opts.run(t.keys);
          patch(t.key, { status: "completed", result });
          await safeStore(t.key, "completed", { result_json: result });
          return;
        } catch (e) {
          const msg = e instanceof Error ? e.message : "تعذر تنفيذ هذا الجزء.";
          if (attempt === 1 && isRetriable(e)) {
            await sleep(backoff(attempt));
            continue;
          }
          patch(t.key, { status: "failed", error: msg });
          await safeStore(t.key, "failed", { error_message: msg });
          return;
        }
      }
    }),
  );
  return parts;
}

export function caseStatusFor(parts: PartState[]): CaseStatus {
  const done = parts.filter((p) => p.status === "completed").length;
  if (done === parts.length) return "completed";
  if (parts.some((p) => p.status === "running" || p.status === "pending") && !parts.some((p) => p.status === "failed")) return "running";
  return done > 0 ? "partial" : "failed";
}

export function mergeParts(parts: PartState[]): Partial<ModelOutput> {
  return Object.assign({}, ...parts.filter((p) => p.status === "completed" && p.result).map((p) => p.result));
}
