/** تشغيل أجزاء المراجعة بصورة متحملة للفشل وقابلة للاستكمال — منطق نقي قابل للاختبار */
import { partStage, type ModelKey, type ModelOutput } from "./iep-schema";
import { computeTtapPatterns, type TtapPattern } from "./ttap-profile";
import type { CaseStatus, PartStatus } from "./review-store";

export type PartState = { key: string; keys: ModelKey[]; label: string; status: PartStatus; error?: string | undefined; attempts: number; result?: Partial<ModelOutput> | undefined };

export const partKey = (keys: ModelKey[]) => keys.join("+");

export function partLabel(keys: ModelKey[]) {
  if (keys.includes("plan_inventory")) return "حصر الأهداف والاحتياجات";
  if (keys.includes("review_decision")) return "القرار والموجز والأولويات";
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
  run: (keys: ModelKey[], context: PartContext) => Promise<Partial<ModelOutput>>;
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

  const runOne = async (t: PartState) => {
    let attempt = 0;
    for (;;) {
      attempt += 1;
      const attempts = (parts.find((p) => p.key === t.key)?.attempts ?? 0) + 1;
      patch(t.key, { status: "running", error: undefined, attempts });
      await safeStore(t.key, "running", { increment_attempts: true });
      try {
        // سياق الأجزاء المكتملة حتى الآن (الحصر للمرحلة التحليلية، والخلاصة لمرحلة القرار)
        const result = await opts.run(t.keys, buildPartContext(mergeParts(parts)));
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
  };

  // المراحل تُنفَّذ بالترتيب، وأجزاء المرحلة الواحدة بالتوازي. فشل مرحلة لا يوقف ما بعدها.
  const stages = [...new Set(targets.map((t) => partStage(t.keys)))].sort((a, b) => a - b);
  for (const st of stages) await Promise.allSettled(targets.filter((t) => partStage(t.keys) === st).map(runOne));
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

/** ما يُرسل مع كل جزء من نتائج الأجزاء السابقة — مختصر لا يتجاوز سقف الطلب */
export type PartContext = {
  plan_inventory?: ModelOutput["plan_inventory"];
  ttap_patterns?: TtapPattern[];
  digest?: Record<string, unknown>;
};

export function buildPartContext(m: Partial<ModelOutput>): PartContext {
  const ctx: PartContext = {};
  if (m.plan_inventory?.goals?.length || m.plan_inventory?.needs?.length) ctx.plan_inventory = m.plan_inventory;
  const tp = computeTtapPatterns(m.ttap_profile);
  if (tp.length) ctx.ttap_patterns = tp;
  const d: Record<string, unknown> = {};
  if (m.goal_review) d["goal_review"] = { goals: m.goal_review.goals.map((g) => ({ goal_number: g.goal_number, verdict: g.verdict, issue: g.issue })), recurring_patterns: m.goal_review.recurring_patterns };
  if (m.plaafp_assessment) d["plaafp_assessment"] = { judgment: m.plaafp_assessment.judgment, needs_improvement: m.plaafp_assessment.needs_improvement, constrained_judgments: m.plaafp_assessment.constrained_judgments };
  if (m.needs_coverage) d["needs_coverage"] = m.needs_coverage.map((n) => ({ need: n.need, status: n.coverage_status }));
  if (m.whole_plan) d["whole_plan"] = { judgment: m.whole_plan.judgment, scattered_goals: m.whole_plan.scattered_goals };
  if (m.transition_minimum) d["transition_minimum"] = { judgment: m.transition_minimum.judgment };
  if (m.transition_coverage) d["transition_coverage"] = m.transition_coverage.map((t) => ({ concept: t.concept, status: t.status }));
  if (m.criteria_results) d["criteria_results"] = m.criteria_results.map((f) => ({ id: f.criterion_id, status: f.status, severity: f.severity }));
  if (m.revisions) d["revisions"] = m.revisions.map((r) => ({ goal_number: r.goal_number, defect_type: r.defect_type, priority: r.priority }));
  if (m.recommendations) d["recommendations"] = m.recommendations;
  if (m.assessment_alignment?.length) d["assessment_alignment"] = m.assessment_alignment.map((a) => ({ ref: a.ref, status: a.status, goal_refs: a.goal_refs }));
  if (Object.keys(d).length) ctx.digest = d;
  return ctx;
}
