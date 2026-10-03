import type { IepAuditReport } from "./iep-schema";

export const REPORT_SECTION_OPTIONS = [
  { id: "summary", label: "ملخص بيانات الطالب" },
  { id: "overview", label: "الرؤية العامة" },
  { id: "revisions", label: "جدول تتبع التعديلات" },
  { id: "mapping", label: "الاحتياجات غير المغطاة" },
  { id: "categories", label: "تصنيف التعديلات الثلاثي" },
  { id: "standards", label: "معايير الجودة الـ 24" },
  { id: "recommendations", label: "التوصيات" },
] as const;

export type ReportSectionId = (typeof REPORT_SECTION_OPTIONS)[number]["id"];
export type ReportSections = Record<ReportSectionId, boolean>;

export const DEFAULT_REPORT_SECTIONS: ReportSections = Object.fromEntries(
  REPORT_SECTION_OPTIONS.map(({ id }) => [id, true]),
) as ReportSections;

const fileBase = (r: IepAuditReport) =>
  `iep-audit-${(r.micro_audit_summary.student_name || "iep").replace(/\s+/g, "_")}`;

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportJson(data: { report: IepAuditReport; parity?: unknown }, report: IepAuditReport, sections: ReportSections) {
  const selectedReport = {
    ...(sections.summary ? { micro_audit_summary: report.micro_audit_summary } : {}),
    ...(sections.overview ? { macro_plan_engineering: report.macro_plan_engineering } : {}),
    ...(sections.revisions || sections.categories ? { revisions: report.revisions } : {}),
    ...(sections.mapping ? { need_goal_mapping: report.need_goal_mapping.filter((item) => !item.covering_goal) } : {}),
    ...(sections.standards ? { checklist_24_standards_status: report.checklist_24_standards_status } : {}),
    ...(sections.recommendations ? { recommendations: report.recommendations } : {}),
  };
  download(
    new Blob([JSON.stringify({ report: selectedReport, ...(data.parity ? { parity: data.parity } : {}) }, null, 2)], { type: "application/json" }),
    `${fileBase(report)}.json`,
  );
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
  const s = report.micro_audit_summary;
  const m = report.macro_plan_engineering;
  const q = m.horizontal_analysis_6_questions;
  const c = report.checklist_24_standards_status;

  const overviewQuestions = [
    `ترابط مجالات وأهداف الخطة: ${q.q1_horizontal_bundling} ${q.q2_cross_domain_integration} ${q.q6_scattered_goals_detected}`,
    `التسلسل المنطقي للخطة: ${q.q3_sequential_logic}`,
    `الأثر المتوقع في حياة المتعلم: ${q.q4_observable_life_impact}`,
    `الجاهزية لما بعد التخرج: ${q.q5_post_graduation_readiness}`,
  ];
  const uncoveredNeeds = report.need_goal_mapping.filter((item) => !item.covering_goal);

  const children = [
    p("تقرير تدقيق الخطة التربوية الفردية", { heading: HeadingLevel.TITLE }),
    ...(sections.summary ? [
      p(`الطالب: ${s.student_name} — العمر: ${s.age ?? "غير محدد"} — نوع الإعاقة: ${s.disability_type}`),
      p(`الأهداف المراجعة: ${s.total_goals_reviewed} — درجة الجودة: ${s.quality_score_24_standards}% — تغطية الاحتياجات: ${s.plaafp_coverage_complete ? "مكتملة" : "غير مكتملة"}`),
    ] : []),
    ...(sections.overview ? [
      p("الرؤية العامة", { heading: HeadingLevel.HEADING_1 }),
      p(`درجة التكامل: ${m.integration_score_percent}% — مسار المهارات المهنية: ${m.target_functional_role}`),
      ...overviewQuestions.map((t, i) => p(`${i + 1}. ${t}`)),
      p(`توصيات الرؤية العامة: ${m.macro_recommendation}`, { bold: true }),
    ] : []),
    ...(sections.revisions ? [p("جدول تتبع التعديلات", { heading: HeadingLevel.HEADING_1 }), new Table({
      visuallyRightToLeft: true,
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ tableHeader: true, children: ["المجال", "الهدف الأصلي", "الهدف المعدل", "التصنيف", "السبب والمعيار"].map((h) => cell(h, true)) }),
        ...report.revisions.map(
          (r) =>
            new TableRow({
              children: [r.domain, r.original_goal, r.revised_goal, r.revision_category, `${r.rationale} (${r.standards_violated.join("، ")})`].map((t) => cell(t)),
            }),
        ),
      ],
    })] : []),
    ...(sections.mapping ? [
      p("الاحتياجات غير المغطاة ضمن مستوى الأداء الحالي", { heading: HeadingLevel.HEADING_1 }),
      ...(uncoveredNeeds.length > 0 ? uncoveredNeeds.map((n) => p(`غير مغطى — ${n.need}`)) : [p("لا توجد احتياجات غير مغطاة.")]),
    ] : []),
    ...(sections.categories ? [
      p("تصنيف التعديلات الثلاثي", { heading: HeadingLevel.HEADING_1 }),
      ...(["تحسين جودة الهدف", "تعديل صياغة غير ملائمة", "تحسين لغة واتساق"] as const).flatMap((category) => [
        p(category, { bold: true }),
        ...report.revisions.filter((revision) => revision.revision_category === category).map((revision) => p(revision.revised_goal)),
      ]),
    ] : []),
    ...(sections.standards ? [
      p("معايير الجودة الـ 24", { heading: HeadingLevel.HEADING_1 }),
      ...[c.pillar_1_plaafp, c.pillar_2_smart_goals, c.pillar_3_admin, c.pillar_4_transition, c.items_13_7_to_13_11_plan_engineering].map((t) => p(t)),
    ] : []),
    ...(sections.recommendations ? [
      p("التوصيات", { heading: HeadingLevel.HEADING_1 }),
      ...report.recommendations.map((t, i) => p(`${i + 1}. ${t}`)),
    ] : []),
  ];

  const doc = new Document({ sections: [{ children }] });
  download(await Packer.toBlob(doc), `${fileBase(report)}.docx`);
}
