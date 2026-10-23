/**
 * المرحلة الثانية من مواصفة الاتساق:
 *  M-4 مدقق صياغة حتمي للأهداف (بدون نموذج).
 *  M-5 مدقق اتساق بين أقسام التقرير.
 * المدققان لا يغيّران أي حكم أو قرار — ينتجان تنبيهات للمشرف فقط، والقرار الأخير له.
 */
import type { IepAuditReport } from "./iep-schema";

export type ConsistencyAlert = {
  code: string;
  scope: string; // الهدف أو القسم المعني
  message: string;
};

// الأرقام قد تُكتب بالأرقام الغربية أو الهندية أو بالكلمات (أربع من أصل خمس)
const NUM_WORDS = "(?:واحد|واحدة|اثن|ثلاث|أربع|اربع|خمس|ست|سبع|ثمان|تسع|عشر|عشرين|ثلاثين|أربعين|خمسين)";
const D = "[0-9٠-٩]";
const PCT = new RegExp(`(${D}+(?:[.,٫]${D}+)?\\s*[%٪])|(بنسبة\\s+${D}+)`, "g");
const TRIALS = /(محاول|فرص|مرات|مرة)/;
const DENOMINATOR = new RegExp(`(من\\s*([أا]صل\\s*)?(${D}+|${NUM_WORDS})|${D}+\\s*/\\s*${D}+|من\\s+(كل|[أا]صل|عدد))`);
const NUMBER = new RegExp(`${D}|(?:^|\\s)${NUM_WORDS}`);
const VAGUE = /(?:^|\s)(يتعرف على|يفهم|يدرك|يعي|يتقبل|يتحسن|يكتسب مهارة)(?=\s|$|[،,.])/;
const REPEATED = /(?:^|\s)([؀-ۿ]{3,})(?:\s*[،,.…]*\s*)\1(?=\s|$|[،,.…])/;

/** M-4: فحص صياغة هدف واحد — يعيد قائمة الملاحظات */
export function checkGoalWording(text: string): string[] {
  const t = (text || "").trim();
  if (!t) return [];
  const out: string[] = [];
  const rep = t.match(REPEATED);
  if (rep) out.push(`تكرار لفظي «${rep[1]}… ${rep[1]}»`);
  const pcts = t.match(PCT) ?? [];
  if (pcts.length >= 2) out.push(`أكثر من معيار نجاح في هدف واحد (${pcts.length} نسب)`);
  if (TRIALS.test(t) && NUMBER.test(t) && !DENOMINATOR.test(t) && !pcts.length) out.push("عدد المحاولات أو الفرص بلا مقام (من أصل كم؟)");
  if (!NUMBER.test(t) && !/(مستقل|دون مساعدة|بدون مساعدة)/.test(t)) out.push("لا يظهر معيار أداء قابل للقياس");
  const vague = t.match(VAGUE);
  if (vague) out.push(`فعل غير قابل للملاحظة المباشرة «${vague[1]}»`);
  return out;
}

const READY = (d: string) => d === "جاهزة للاعتماد" || d === "جاهزة بعد تعديلات محدودة";

/** M-4 + M-5: كل تنبيهات الاتساق لتقرير واحد */
export function checkReportConsistency(report: IepAuditReport): ConsistencyAlert[] {
  const alerts: ConsistencyAlert[] = [];
  const goals = report.goal_review?.goals ?? [];
  const decision = report.review_decision;
  const plaafp = report.plaafp_assessment?.judgment;

  // M-4: الأهداف المحكوم بسلامتها وفيها ملاحظات صياغة
  for (const g of goals) {
    if (g.verdict !== "سليم") continue;
    const issues = checkGoalWording(g.goal_text);
    if (issues.length)
      alerts.push({
        code: "W-SOUND",
        scope: `الهدف ${g.goal_number || "؟"}`,
        message: `حُكم عليه «سليم» لكن المدقق الآلي رصد: ${issues.join("؛ ")}.`,
      });
  }

  // M-5/C1: القرار مقابل حكم مستوى الأداء الحالي
  if (READY(decision) && (plaafp === "يحتاج تحسيناً جوهرياً" || plaafp === "غير قابل للتحقق"))
    alerts.push({
      code: "C-PLAAFP",
      scope: "قرار المراجعة",
      message: `القرار «${decision}» لا يتسق مع حكم مستوى الأداء الحالي «${plaafp}». يُرجى مراجعة القرار قبل الاعتماد.`,
    });

  // C2: اعتماد مباشر مع أهداف تحتاج تعديلاً
  const needs = goals.filter((g) => g.verdict === "يحتاج تعديل").length;
  if (decision === "جاهزة للاعتماد" && needs > 0)
    alerts.push({ code: "C-GOALS", scope: "قرار المراجعة", message: `القرار «جاهزة للاعتماد» مع ${needs} أهداف تحتاج تعديلاً.` });

  // C3: أرقام أهداف مكررة
  const nums = goals.map((g) => (g.goal_number || "").trim()).filter(Boolean);
  const dups = [...new Set(nums.filter((n, i) => nums.indexOf(n) !== i))];
  if (dups.length)
    alerts.push({ code: "C-DUP", scope: "مراجعة الأهداف", message: `أرقام أهداف مكررة: ${dups.join("، ")} — تحقق من حصر الأهداف.` });

  // C4: جدول الأهداف الانتقالية أكبر من عدد الأهداف المراجعة
  const tGoals = report.transition_minimum?.goals?.length ?? 0;
  if (goals.length && tGoals > goals.length)
    alerts.push({
      code: "C-TCOUNT",
      scope: "الأهداف الانتقالية",
      message: `جدول الأهداف الانتقالية يضم ${tGoals} صفاً بينما عدد الأهداف المراجعة ${goals.length}.`,
    });

  // C5: هدف مراجَع بلا نص
  const empty = goals.filter((g) => !(g.goal_text || "").trim()).length;
  if (empty) alerts.push({ code: "C-EMPTY", scope: "مراجعة الأهداف", message: `${empty} أهداف بلا نص مستخرج.` });

  // M-6: مطابقة مراجعة الأهداف مع الحصر المرقّم (للتقارير التي نُفّذ فيها الحصر)
  const inv = report.plan_inventory?.goals ?? [];
  if (inv.length && goals.length) {
    const refs = new Set(inv.map((g) => g.ref.trim()));
    const missing = inv.filter((g) => !goals.some((x) => x.goal_number.trim() === g.ref.trim())).map((g) => g.ref);
    const extra = goals.filter((x) => !refs.has(x.goal_number.trim())).map((x) => x.goal_number || "؟");
    if (missing.length || extra.length)
      alerts.push({
        code: "C-INV",
        scope: "حصر الأهداف",
        message: `الحصر يضم ${inv.length} هدفاً ومراجعة الأهداف ${goals.length}.${missing.length ? ` غير مراجَعة: ${missing.join("، ")}.` : ""}${extra.length ? ` خارج الحصر: ${extra.join("، ")}.` : ""}`,
      });
  }

  // M-7: كل أولوية تحيل إلى قسمها
  if (inv.length) {
    const unref = (report.top_priorities ?? []).filter((p) => !/المرجع\s*:/.test(p)).length;
    if (unref) alerts.push({ code: "C-REF", scope: "أهم أولويات التصحيح", message: `${unref} أولويات بلا إحالة إلى القسم الذي تستند إليه.` });
  }

  return alerts;
}
