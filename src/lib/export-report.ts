import {
  CRITERIA_REGISTRY,
  CRITERION_STATE_LABELS,
  EVIDENCE_SOURCES,
  REVIEW_TYPES,
  SOURCE_STATE_LABELS,
  criterionById,
  pillarsForReviewType,
} from "./criteria-registry";
import { REVIEWER_STATUS_LABELS, type IepAuditReport } from "./iep-schema";

export const REPORT_SECTION_OPTIONS = [
  { id: "summary", label: "بيانات الطالب" },
  { id: "scope", label: "نطاق المراجعة ومصادر الأدلة" },
  { id: "criteria_config", label: "المعايير المفعلة والمجمدة" },
  { id: "executive", label: "الموجز التنفيذي" },
  { id: "decision", label: "قرار المراجعة" },
  { id: "gates", label: "البوابات الحرجة" },
  { id: "standards", label: "معايير الجودة" },
  { id: "plaafp", label: "مستوى الأداء الحالي" },
  { id: "smart", label: "مراجعة SMART" },
  { id: "mapping", label: "مصفوفة تغطية الاحتياجات" },
  { id: "whole_plan", label: "الرؤية الكلية والترابط الوظيفي" },
  { id: "routines", label: "استثمار الروتين اليومي" },
  { id: "personal_social", label: "المهارات الشخصية والاجتماعية" },
  { id: "transition_min", label: "الحد الأدنى من مفاهيم الانتقال" },
  { id: "transition_goals", label: "الأهداف الانتقالية الموجودة" },
  { id: "vertical", label: "المواءمة الرأسية (خطة سابقة)" },
  { id: "before_after", label: "Before & After" },
  { id: "recommendations", label: "التوصيات الإشرافية" },
  { id: "manual_notes", label: "ملاحظات المشرف اليدوية" },
] as const;

export type ReportSectionId = (typeof REPORT_SECTION_OPTIONS)[number]["id"];
export type ReportSections = Record<ReportSectionId, boolean>;

export const DEFAULT_REPORT_SECTIONS: ReportSections = Object.fromEntries(
  REPORT_SECTION_OPTIONS.map(({ id }) => [id, true]),
) as ReportSections;

export type ReportBlock = {
  id: ReportSectionId;
  title: string;
  lines: string[];
  table?: { head: string[]; rows: string[][] } | undefined;
};

const titleOf = (id: ReportSectionId) => REPORT_SECTION_OPTIONS.find((o) => o.id === id)!.label;
const v = (t: string | null | undefined, fallback = "—") => (t && t.trim() ? t : fallback);

/**
 * المصدر الموحد لمحتوى التقرير — تعرضه الواجهة والطباعة وWord، وتُصفّى به JSON.
 * الأقسام الفارغة (غير المنفذة في نطاق المراجعة) لا تُنتج كتلاً.
 */
export function buildReportBlocks(report: IepAuditReport, sections: ReportSections = DEFAULT_REPORT_SECTIONS): ReportBlock[] {
  const cfg = report.review_config;
  const s = report.student_info;
  const pillars = new Set(pillarsForReviewType(cfg.review_type));
  const blocks: ReportBlock[] = [];
  const push = (b: ReportBlock) => {
    if (sections[b.id] && (b.lines.some((l) => l.trim()) || (b.table && b.table.rows.length))) blocks.push(b);
  };

  push({
    id: "summary",
    title: titleOf("summary"),
    lines: [`الاسم: ${v(s.student_name)} — العمر: ${s.age ?? "غير محدد"} — نوع الإعاقة: ${v(s.disability_type)} — المركز/المدرسة: ${v(s.school_center, "غير محدد")}`],
  });
  push({
    id: "scope",
    title: titleOf("scope"),
    lines: [`نوع المراجعة: ${REVIEW_TYPES.find((t) => t.id === cfg.review_type)?.label ?? cfg.review_type}`],
    table: { head: ["المصدر", "الحالة"], rows: EVIDENCE_SOURCES.map((x) => [x.label, SOURCE_STATE_LABELS[cfg.sources[x.id]]]) },
  });
  const cfgRows = CRITERIA_REGISTRY.flatMap((p) =>
    p.criteria.map((c) => {
      const st = cfg.criteria[c.id]?.state ?? "active";
      const label = pillars.has(p.id) ? CRITERION_STATE_LABELS[st] : "خارج نوع المراجعة";
      return [c.id, c.label, label, cfg.criteria[c.id]?.reason ?? ""];
    }),
  );
  const notVerifiable = report.criteria_results.filter((f) => f.status === "غير قابل للتحقق من الوثيقة المقدمة").map((f) => f.criterion_id);
  push({
    id: "criteria_config",
    title: titleOf("criteria_config"),
    lines: [notVerifiable.length ? `معايير غير قابلة للتحقق من الوثيقة المقدمة: ${notVerifiable.join("، ")}` : ""],
    table: { head: ["الرقم", "المعيار", "الحالة", "سبب التجميد"], rows: cfgRows },
  });
  push({ id: "executive", title: titleOf("executive"), lines: [report.executive_summary] });
  push({ id: "decision", title: titleOf("decision"), lines: [`قرار المراجعة: ${report.review_decision}`] });
  push({
    id: "gates",
    title: titleOf("gates"),
    lines: report.critical_gates.length ? [] : ["لم تُرصد بوابات حرجة."],
    table: report.critical_gates.length
      ? { head: ["البوابة", "الوصف", "الدليل"], rows: report.critical_gates.map((g) => [g.gate, g.description, v(g.evidence_text)]) }
      : undefined,
  });
  push({
    id: "standards",
    title: titleOf("standards"),
    lines: [],
    table: {
      head: ["المعيار", "الحالة", "الأهمية", "الدليل", "التحليل", "الإجراء المقترح", "مصدر الدليل", "حالة المراجع"],
      rows: report.criteria_results.map((f) => [
        `${f.criterion_id} ${criterionById(f.criterion_id)?.label ?? ""}`,
        f.status,
        f.severity,
        [v(f.evidence_text), f.page_or_section].filter(Boolean).join(" — "),
        f.reasoning_summary,
        v(f.recommended_action),
        f.evidence_origin === "document" ? `الوثيقة${f.source_document ? `: ${f.source_document}` : ""}` : f.evidence_origin === "external_reviewer_attestation" ? "تأكيد المراجع" : "غير متوفر",
        REVIEWER_STATUS_LABELS[f.reviewer_status],
      ]),
    },
  });
  push({ id: "plaafp", title: titleOf("plaafp"), lines: [report.plaafp_review] });
  push({ id: "smart", title: titleOf("smart"), lines: [report.smart_review] });
  push({
    id: "mapping",
    title: titleOf("mapping"),
    lines: [],
    table: {
      head: ["المجال", "الاحتياج", "الهدف المقابل", "حالة التغطية", "ملاحظة", "الهدف المقترح"],
      rows: report.needs_coverage.map((n) => [n.domain, n.need, v(n.matched_goal), n.coverage_status, v(n.note), v(n.suggested_goal)]),
    },
  });
  const wp = report.whole_plan;
  push({
    id: "whole_plan",
    title: titleOf("whole_plan"),
    lines: wp.within_domain_coherence || wp.cross_domain_integration
      ? [
          `الحكم النوعي: ${wp.judgment}`,
          `ترابط الأهداف داخل المجال: ${wp.within_domain_coherence}`,
          `التكامل بين المجالات: ${wp.cross_domain_integration}`,
          `التسلسل المنطقي: ${wp.sequential_logic}`,
          `الأهداف المشتتة: ${wp.scattered_goals}`,
          `السؤال الحاكم: ${wp.governing_question_answer}`,
        ]
      : [],
    table: wp.functional_clusters.length
      ? { head: ["الدور/المهمة الوظيفية", "الأهداف المترابطة"], rows: wp.functional_clusters.map((c) => [c.role, c.goals.join(" ← ")]) }
      : undefined,
  });
  push({
    id: "routines",
    title: titleOf("routines"),
    lines: [report.daily_routines.comment],
    table: report.daily_routines.opportunities.length
      ? { head: ["الموقف اليومي", "الفرصة الوظيفية", "الدليل"], rows: report.daily_routines.opportunities.map((o) => [o.routine, o.opportunity, v(o.evidence_text)]) }
      : undefined,
  });
  push({ id: "personal_social", title: titleOf("personal_social"), lines: [report.personal_social] });
  const tm = report.transition_minimum;
  push({
    id: "transition_min",
    title: titleOf("transition_min"),
    lines: tm.answer ? [`الحكم: ${tm.judgment}`, tm.answer, ...tm.integrated_pathways.map((p) => `مسار انتقالي متكامل: ${p}`)] : [],
  });
  push({
    id: "transition_goals",
    title: titleOf("transition_goals"),
    lines: [],
    table: { head: ["المجال", "الهدف", "مفهوم الانتقال", "ملاحظة"], rows: tm.goals.map((g) => [g.domain, g.goal, g.concept, v(g.note)]) },
  });
  const va = report.vertical_alignment;
  push({
    id: "vertical",
    title: titleOf("vertical"),
    lines: va.available ? [va.comment] : [],
    table: va.available && va.items.length
      ? { head: ["الهدف السابق", "مستوى التقدم", "الهدف الحالي", "الخطوة الوظيفية الأكبر", "ملاحظة"], rows: va.items.map((i) => [i.previous_goal, v(i.progress), i.current_goal, i.next_step, v(i.note)]) }
      : undefined,
  });
  const revs = report.revisions.filter((r) => r.reviewer_status !== "rejected");
  push({
    id: "before_after",
    title: titleOf("before_after"),
    lines: [],
    table: {
      head: ["المجال", "رقم الهدف", "الهدف الأصلي", "نوع الخلل", "المعيار المتأثر", "سبب التعديل", "الهدف المقترح", "القاعدة الفنية", "التصنيف", "الأولوية", "ملاحظة"],
      rows: revs.map((r) => [r.domain, v(r.goal_number), r.original_goal, r.defect_type, r.criterion_affected, r.rationale, r.revised_goal, r.technical_rule, r.revision_category, r.priority, v(r.note)]),
    },
  });
  push({ id: "recommendations", title: titleOf("recommendations"), lines: report.recommendations.map((t, i) => `${i + 1}. ${t}`) });
  push({ id: "manual_notes", title: titleOf("manual_notes"), lines: report.manual_notes.map((t, i) => `${i + 1}. ${t}`) });
  return blocks;
}

const fileBase = (r: IepAuditReport) => `iep-audit-${(r.student_info.student_name || "iep").replace(/\s+/g, "_")}`;

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** مفاتيح JSON لكل قسم — نفس عقد الأقسام */
const JSON_KEYS: Record<ReportSectionId, (keyof IepAuditReport)[]> = {
  summary: ["student_info"],
  scope: ["review_config"],
  criteria_config: ["review_config"],
  executive: ["executive_summary"],
  decision: ["review_decision"],
  gates: ["critical_gates"],
  standards: ["criteria_results"],
  plaafp: ["plaafp_review"],
  smart: ["smart_review"],
  mapping: ["needs_coverage"],
  whole_plan: ["whole_plan"],
  routines: ["daily_routines"],
  personal_social: ["personal_social"],
  transition_min: ["transition_minimum"],
  transition_goals: ["transition_minimum"],
  vertical: ["vertical_alignment"],
  before_after: ["revisions"],
  recommendations: ["recommendations"],
  manual_notes: ["manual_notes"],
};

export function selectJson(report: IepAuditReport, sections: ReportSections) {
  const out: Record<string, unknown> = { schema_version: report.schema_version };
  for (const { id } of REPORT_SECTION_OPTIONS) {
    if (!sections[id]) continue;
    for (const k of JSON_KEYS[id]) out[k] = report[k];
  }
  return out;
}

export function exportJson(data: { report: IepAuditReport; parity?: unknown }, report: IepAuditReport, sections: ReportSections) {
  const body = { report: selectJson(report, sections), ...(data.parity ? { parity: data.parity } : {}) };
  download(new Blob([JSON.stringify(body, null, 2)], { type: "application/json" }), `${fileBase(report)}.json`);
}

/** PDF via the browser print dialog — keeps Arabic RTL shaping intact. */
export function exportPdf() {
  window.print();
}

export async function exportDocx(report: IepAuditReport, sections: ReportSections) {
  const d = await import("docx");
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, AlignmentType, WidthType } = d;
  const p = (text: string, opts: { bold?: boolean; heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel] } = {}) =>
    new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.RIGHT,
      ...(opts.heading ? { heading: opts.heading } : {}),
      children: [new TextRun({ text, bold: !!opts.bold, rightToLeft: true, font: "Arial" })],
    });
  const cell = (text: string, bold = false) => new TableCell({ children: [p(text, { bold })] });

  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [
    p("تقرير المراجعة الإشرافية الأولية للخطة التربوية الفردية", { heading: HeadingLevel.TITLE }),
  ];
  for (const b of buildReportBlocks(report, sections)) {
    children.push(p(b.title, { heading: HeadingLevel.HEADING_1 }));
    for (const l of b.lines) if (l.trim()) children.push(p(l));
    if (b.table && b.table.rows.length) {
      children.push(
        new Table({
          visuallyRightToLeft: true,
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ tableHeader: true, children: b.table.head.map((h) => cell(h, true)) }),
            ...b.table.rows.map((r) => new TableRow({ children: r.map((t) => cell(t)) })),
          ],
        }),
      );
    }
  }
  const doc = new Document({ sections: [{ children }] });
  download(await Packer.toBlob(doc), `${fileBase(report)}.docx`);
}
