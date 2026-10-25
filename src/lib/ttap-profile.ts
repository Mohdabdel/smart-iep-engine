/**
 * قراءة بروفايل TTAP (مقياس تيتش لتقييم المرحلة الانتقالية — الإصدار الثاني).
 * الأرقام يستخرجها النموذج من تقرير التقييم، أما الأنماط فتُحسب هنا بقواعد ثابتة
 * حتى لا تُخترع دلالة. الدلالات «مرجّحة» يؤكدها المشرف، وليست حكماً تشخيصياً.
 */
export const TTAP_ITEMS_PER_AREA = 12;
/** فرق «ناجح» بين مقياسين يُعدّ دالاً (قابل للتعديل بقرار المالك) */
export const TTAP_DIFF_THRESHOLD = 3;

export const TTAP_AREAS = [
  { code: "VS", label: "المهارات المهنية", links: "السلاسل المهنية وما قبل المهنية — الاستعداد للعمل" },
  { code: "VB", label: "السلوك المهني", links: "السلوك في بيئة العمل — الاستعداد للعمل والسلوك المهني" },
  { code: "IF", label: "الأداء المستقل", links: "السلاسل الحياتية في المنزل والمجتمع — العناية بالذات والعيش المستقل" },
  { code: "LS", label: "وقت الفراغ", links: "الترفيه والمشاركة المجتمعية" },
  { code: "FC", label: "التواصل الوظيفي", links: "التواصل الوظيفي عبر السياقات" },
  { code: "IB", label: "السلوك بين الأشخاص", links: "المهارات الشخصية والاجتماعية — التعامل مع الزملاء والمشرفين" },
] as const;
export type TtapAreaCode = (typeof TTAP_AREAS)[number]["code"];

export type TtapAreaScores = {
  area: string; // VS | VB | IF | LS | FC | IB
  do_pass: number | null;
  do_emerge: number | null;
  home_pass: number | null;
  home_emerge: number | null;
  school_pass: number | null;
  school_emerge: number | null;
};
export type TtapProfile = { detected: boolean; areas: TtapAreaScores[] };

export type TtapPattern = {
  ref: string; // ت1…
  area: TtapAreaCode;
  area_label: string;
  scores: string; // نص مختصر للأرقام
  pattern: string;
  interpretation: string; // دلالة مرجّحة
  plan_question: string; // ما يُسأل عنه في الخطة
  links: string; // السلاسل ومفاهيم الانتقال المقترح ربطها (اقتراح لا مرجع)
};

/** يتعرف على المجال من رمزه أو من اسمه العربي/الإنجليزي كما قد يكتبه النموذج */
export function resolveTtapArea(raw: string | null | undefined): TtapAreaCode | null {
  const t = (raw ?? "").trim();
  const up = t.toUpperCase();
  for (const c of ["VS", "VB", "IF", "LS", "FC", "IB"] as const) if (up === c || up.startsWith(c + " ") || up.includes(`(${c})`)) return c;
  const has = (...w: string[]) => w.some((x) => t.includes(x) || up.includes(x.toUpperCase()));
  if (has("سلوك") && has("مهن")) return "VB";
  if (has("vocational behav")) return "VB";
  if (has("سلوك") && has("بين", "شخص", "اجتماع")) return "IB";
  if (has("interpersonal")) return "IB";
  if (has("مهن", "vocational skill")) return "VS";
  if (has("مستقل", "استقلال", "independent")) return "IF";
  if (has("ترفيه", "فراغ", "leisure")) return "LS";
  if (has("تواصل", "communication")) return "FC";
  return null;
}

const n = (x: number | null | undefined) => (typeof x === "number" && Number.isFinite(x) ? x : null);

export function computeTtapPatterns(profile: TtapProfile | null | undefined, threshold = TTAP_DIFF_THRESHOLD): TtapPattern[] {
  if (!profile?.detected) return [];
  const out: TtapPattern[] = [];
  for (const meta of TTAP_AREAS) {
    const a = profile.areas.find((x) => resolveTtapArea(x.area) === meta.code);
    if (!a) continue;
    const d = n(a.do_pass), h = n(a.home_pass), s = n(a.school_pass);
    if (d === null && h === null && s === null) continue;
    const de = n(a.do_emerge) ?? 0, he = n(a.home_emerge) ?? 0, se = n(a.school_emerge) ?? 0;
    const scores = `ناجح: ملاحظة ${d ?? "—"} / منزل ${h ?? "—"} / مدرسة ${s ?? "—"} — ناشئ: ${de} / ${he} / ${se} (من ${TTAP_ITEMS_PER_AREA})`;
    const hi = (x: number | null, y: number | null) => x !== null && y !== null && x - y >= threshold;
    const low = (x: number | null) => x !== null && x <= 3;
    let pattern = "";
    let interpretation = "";
    let plan_question = "";
    if (hi(d, h) && hi(d, s)) {
      pattern = "الأداء المباشر أعلى من المنزل والمدرسة";
      interpretation = "المهارة مكتسبة في موقف منظم ولا تُعمَّم إلى البيئات الطبيعية بالقدر الكافي.";
      plan_question = "هل تستهدف الخطة تعميم مهارات هذا المجال داخل الروتين الفعلي بدل إعادة تعليمها؟";
    } else if (hi(d, h) || hi(s, h)) {
      pattern = "المنزل أدنى من الأداء المباشر أو المدرسة";
      if (meta.code === "IF" || meta.code === "LS") {
        // فرضية ترابط: مهارات أساسية متقنة في التدريب لا تُوظَّف في روتين المنزل — الخطة للمتعلم لا للأسرة
        interpretation = "فرضية ترابط مستخلصة من التقييم: مهارات متقنة في التدريب لا تُوظَّف بعد في أنشطة المنزل الروتينية؛ الفجوة في الربط بين السياقين لا في المتعلم أو المدرسة أو المنزل منفردين.";
        plan_question = "هل تتضمن الخطة أهدافاً وأنشطة وظيفية للمتعلم تُمارَس في المدرسة والمنزل معاً لتوظيف هذه المهارات في روتين حقيقي؟";
      } else {
        interpretation = "فرق بين السياقات لصالح الأداء المباشر أو المدرسة؛ دلالته محتملة يتحقق منها المشرف.";
        plan_question = "هل تستهدف الخطة أداء مهارات هذا المجال في المنزل ضمن أنشطة وظيفية؟";
      }
    } else if (hi(h, s) || hi(h, d)) {
      pattern = "المنزل أعلى من المدرسة أو الأداء المباشر";
      interpretation = "المهارة مرتبطة بإشارات أو سياق مألوف، أو أن هيكلة المدرسة لا تدعم ظهورها.";
      plan_question = "هل تعالج الخطة نقل المهارة إلى المدرسة أو تعديل الهيكلة الداعمة؟";
    } else if (hi(d, s)) {
      pattern = "الأداء المباشر أعلى من المدرسة";
      interpretation = "المهارة لا تظهر بالقدر الكافي في الموقف المدرسي الطبيعي.";
      plan_question = "هل توجد أهداف تعميم داخل اليوم المدرسي لهذا المجال؟";
    } else if (low(d) && low(h) && low(s)) {
      pattern = "منخفض في المقاييس الثلاثة";
      interpretation = "قصور اكتساب مرجّح يحتاج تعليماً مباشراً بسلسلة مبسطة.";
      plan_question = "هل تتضمن الخطة تعليماً مباشراً لهذا المجال بخطوات مناسبة؟";
    } else if ((d ?? 0) >= 9 && (h ?? 0) >= 9 && (s ?? 0) >= 9) {
      pattern = "مرتفع في المقاييس الثلاثة";
      interpretation = "نقطة قوة يمكن أن تكون مرتكزاً لسلاسل وظيفية وأدوار أوسع.";
      plan_question = "هل تبني الخطة على هذه القوة في سلاسل وظيفية أو أدوار مهنية؟";
    } else {
      pattern = "متقارب بين المقاييس";
      interpretation = "لا يظهر فرق دال بين السياقات.";
      plan_question = "هل تستهدف الخطة المهارات الناشئة في هذا المجال؟";
    }
    const maxE = Math.max(de, he, se);
    if (maxE >= 6) {
      const where = [de === maxE && "الملاحظة المباشرة", he === maxE && "المنزل", se === maxE && "المدرسة"].filter(Boolean).join(" و");
      interpretation += ` كثرة المهارات الناشئة في ${where} (${maxE}) تجعلها أولوية تعليم وفق منهج تيتش.`;
    }
    out.push({ ref: `ت${out.length + 1}`, area: meta.code, area_label: meta.label, scores, pattern, interpretation, plan_question, links: meta.links });
  }
  return out;
}

export function ttapTotals(profile: TtapProfile | null | undefined) {
  if (!profile?.detected || !profile.areas.length) return null;
  const avg = (k: keyof TtapAreaScores) => {
    const v = profile.areas.map((a) => n(a[k] as number | null)).filter((x): x is number => x !== null);
    return v.length ? Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 100) / 100 : null;
  };
  return { do_pass: avg("do_pass"), home_pass: avg("home_pass"), school_pass: avg("school_pass") };
}
