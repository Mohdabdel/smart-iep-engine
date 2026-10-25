/**
 * كفاية التقييم المرفق لبناء خطة انتقالية — تُحسب من المصادر المرفقة فعلاً،
 * فلا يُدّعى وجود أداة لم تُرفق. السند: مؤشر 13 (تقييم انتقالي مناسب للعمر يغطي
 * الاحتياجات ونقاط القوة والتفضيلات والاهتمامات). النقص توصية لا خلل في الخطة.
 */
import { EVIDENCE_SOURCES, sourceState, type EvidenceSourceId, type ReviewConfig } from "./criteria-registry";
import type { TtapProfile } from "./ttap-profile";

export type AdequacyRow = { aspect: string; covered_by: string; status: "مغطى" | "غير مغطى" | "يحكم المشرف"; effect: string };

const has = (c: ReviewConfig, ids: EvidenceSourceId[]) => ids.filter((id) => sourceState(c, id) !== "unavailable");
const names = (ids: EvidenceSourceId[]) => ids.map((id) => EVIDENCE_SOURCES.find((s) => s.id === id)?.label ?? id).join("، ");

export function assessmentAdequacy(config: ReviewConfig, ttap: TtapProfile | null | undefined) {
  const isTtap = !!ttap?.detected;
  const assess = has(config, ["formal_assessment", "informal_assessment"]);
  const rows: AdequacyRow[] = [];
  const recs: string[] = [];
  const constrained: string[] = [];

  rows.push(
    isTtap
      ? { aspect: "ملاءمة الأداة للعمر والمرحلة الانتقالية", covered_by: "TTAP", status: "مغطى", effect: "أداة مصممة للمراهقين والراشدين في مرحلة الانتقال." }
      : assess.length
        ? { aspect: "ملاءمة الأداة للعمر والمرحلة الانتقالية", covered_by: names(assess), status: "يحكم المشرف", effect: "يتحقق المشرف من ملاءمة الأداة لعمر المتعلم وأغراض الانتقال." }
        : { aspect: "ملاءمة الأداة للعمر والمرحلة الانتقالية", covered_by: "—", status: "غير مغطى", effect: "لم يُرفق تقييم؛ المراجعة مقيدة بما ورد في مستوى الأداء الحالي في الخطة." },
  );
  const needsSrc = assess.length ? names(assess) : "";
  rows.push({ aspect: "الاحتياجات ونقاط القوة", covered_by: needsSrc || "—", status: needsSrc ? "مغطى" : "غير مغطى", effect: needsSrc ? "تُقرأ الاحتياجات والقوة من التقييم ويُطابَق بها مستوى الأداء." : "الحكم على أمانة مستوى الأداء وخط الأساس غير قابل للتحقق من مصدر مستقل." });
  if (!needsSrc) {
    recs.push("إرفاق تقييم انتقالي مناسب للعمر (مثل TTAP) يبيّن الاحتياجات ونقاط القوة عبر السياقات.");
    constrained.push("أمانة نقل نتائج التقييم وخط الأساس المستمد منه");
  }

  const pref = has(config, ["interest_inventory", "learner_voice"]);
  rows.push({ aspect: "التفضيلات والاهتمامات المهنية", covered_by: pref.length ? names(pref) : "—", status: pref.length ? "مغطى" : "غير مغطى", effect: pref.length ? "يمكن الحكم على ارتباط الأهداف باهتمامات المتعلم." : "ارتباط أهداف ما بعد التخرج باهتمامات المتعلم غير قابل للتحقق." });
  if (!pref.length) {
    recs.push("استكمال استبيان للميول والتفضيلات المهنية أو مقابلة لصوت المتعلم.");
    constrained.push("ملاءمة الأهداف الانتقالية لاهتمامات المتعلم وتفضيلاته");
  }

  const sd = has(config, ["self_determination", "learner_voice"]);
  rows.push({ aspect: "تقرير المصير وصوت المتعلم", covered_by: sd.length ? names(sd) : "—", status: sd.length ? "مغطى" : "غير مغطى", effect: sd.length ? "يمكن الحكم على أهداف الاختيار والمبادرة في ضوء مصدر مباشر." : "أهداف الاختيار والمبادرة تُراجع دون مرجع من المتعلم نفسه." });
  if (!sd.length) recs.push("تطبيق أداة لتقرير المصير أو توثيق مشاركة المتعلم في تحديد أهدافه.");

  const fam = has(config, ["family_input"]);
  const famBy = [isTtap ? "المقياس المنزلي في TTAP" : "", fam.length ? names(fam) : ""].filter(Boolean).join("، ");
  rows.push({ aspect: "منظور الأسرة والمنزل", covered_by: famBy || "—", status: famBy ? "مغطى" : "غير مغطى", effect: famBy ? "تُقارن مهارات المنزل بالمدرسة لقراءة التعميم وفرص الأداء." : "تعميم المهارات إلى المنزل غير قابل للتحقق." });
  if (!famBy) recs.push("توثيق مدخلات الأسرة عن أداء المتعلم في المنزل.");

  const informants = (isTtap ? 3 : 0) + has(config, ["informal_assessment", "specialist_reports", "progress_report", "family_input", "learner_voice", "interest_inventory", "self_determination"]).length + (assess.length && !isTtap ? 1 : 0);
  rows.push({ aspect: "تعدد مصادر البيانات", covered_by: isTtap ? "ثلاثة مقاييس في TTAP" + (informants > 3 ? " ومصادر أخرى" : "") : String(informants || "—"), status: informants >= 2 ? "مغطى" : "غير مغطى", effect: informants >= 2 ? "تتيح المصادر المتعددة التمييز بين اكتساب المهارة وأدائها في السياقات." : "مصدر واحد لا يكفي للتمييز بين غياب المهارة وغياب فرصتها." });

  const verdict = !assess.length
    ? "لم يُرفق تقييم: المراجعة على الخطة وحدها وفق ما ورد في مستوى الأداء الحالي."
    : recs.length
      ? `التقييم المرفق ${isTtap ? "(TTAP) مناسب للعمر ويغطي المهارات عبر السياقات" : "يغطي جانباً من الصورة"}، لكنه لا يكفي وحده لبناء رؤية انتقالية كاملة.`
      : "مصادر التقييم المرفقة تغطي جوانب التقييم الانتقالي الأساسية.";
  return { rows, recommendations: recs, constrained, verdict };
}
