import { PILLAR_MAX_SCORES, REVISION_CATEGORIES, type IepAuditReport } from "./iep-schema";

export const REPORT_SECTION_OPTIONS = [
  { id: "summary", label: "بيانات الطالب" },
  { id: "standards", label: "التقييم الرقمي للمعايير الـ 24" },
  { id: "overview", label: "الرؤية العامة للخطة" },
  { id: "revisions", label: "جدول تتبع التعديلات" },
  { id: "mapping", label: "مصفوفة تغطية الاحتياجات" },
  { id: "categories", label: "تصنيف التعديلات الثلاثي" },
  { id: "recommendations", label: "التوصيات الإشرافية" },
] as const;

export type ReportSectionId = (typeof REPORT_SECTION_OPTIONS)[number]["id"];
export type ReportSections = Record<ReportSectionId, boolean>;

export const DEFAULT_REPORT_SECTIONS: ReportSections = Object.fromEntries(
  REPORT_SECTION_OPTIONS.map(({ id }) => [id, true]),
) as ReportSections;

export const PILLAR_LABELS: { key: keyof typeof PILLAR_MAX_SCORES; label: string }[] = [
  { key: "pillar_1_plaafp", label: "محور مستوى الأداء الحالي (PLAAFP)" },
  { key: "pillar_2_smart_goals", label: "محور الأهداف السنوية القابلة للقياس (SMART)" },
  { key: "pillar_3_admin", label: "محور الجودة العملية والإدارية" },
  { key: "pillar_4_transition", label: "محور المواءمة النمائية والانتقالية" },
];

const fileBase = (r: IepAuditReport) =>
  `iep-audit-${(r.student_info.student_name || "iep").replace(/\s+/g, "_")}`;

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
    ...(sections.summary ? { student_info: report.student_info } : {}),
    ...(sections.standards ? { level1_quality_standards: report.level1_quality_standards } : {}),
    ...(sections.overview ? { overall_vision: report.level2_supervisory_review.overall_vision } : {}),
    ...(sections.mapping ? { needs_coverage: report.level2_supervisory_review.needs_coverage } : {}),
    ...(sections.revisions || sections.categories ? { revisions: report.revisions } : {}),
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
  const s = report.student_info;
  const l1 = report.level1_quality_standards;
  const vision = report.level2_supervisory_review.overall_vision;
  const coverage = report.level2_supervisory_review.needs_coverage;

  const visionItems = [
    `الترابط الأفقي وسلاسل التعلم: ${vision.horizontal_bundling}`,
    `التكامل بين الأهداف والمجالات: ${vision.cross_domain_integration}`,
    `التسلسل المنطقي لمسار التدريب: ${vision.sequential_logic}`,
    `رصد الأهداف المشتتة: ${vision.scattered_goals}`,
  ];

  const children = [
    p("تقرير مراجعة وهندسة الخطة التربوية الفردية", { heading: HeadingLevel.TITLE }),
    ...(sections.summary ? [
      p("بيانات الطالب", { heading: HeadingLevel.HEADING_1 }),
      p(`الاسم: ${s.student_name} — العمر: ${s.age ?? "غير محدد"} — نوع الإعاقة: ${s.disability_type} — المركز/المدرسة: ${s.school_center || "غير محدد"}`),
    ] : []),
    ...(sections.standards ? [
      p("المستوى الأول: التقييم الرقمي لمعايير الجودة الـ 24", { heading: HeadingLevel.HEADING_1 }),
      p(`النتيجة الإجمالية للجودة: ${l1.total_score} من 24 | نسبة الاتساق: ${l1.compliance_percent}%`, { bold: true }),
      p(`قرار الاعتماد الرقمي: ${l1.accreditation_decision}`, { bold: true }),
      ...PILLAR_LABELS.flatMap(({ key, label }, i) => {
        const pillar = l1[key];
        return [
          p(`${i + 1}. ${label}: ${pillar.score} / ${pillar.max_score} | ${pillar.percent}%`, { bold: true }),
          p(`التعليق المختصر: ${pillar.comment}`),
        ];
      }),
    ] : []),
    ...(sections.overview ? [
      p("المستوى الثاني — الجزء أ: الرؤية العامة للخطة", { heading: HeadingLevel.HEADING_1 }),
      ...visionItems.map((t, i) => p(`${i + 1}. ${t}`)),
    ] : []),
    ...(sections.mapping ? [
      p("المستوى الثاني — الجزء ب: مصفوفة تغطية نقاط الاحتياج", { heading: HeadingLevel.HEADING_1 }),
      p(`حالة التغطية: ${coverage.all_covered ? "جميع الاحتياجات مغطاة" : `يوجد ${coverage.uncovered_needs.length} احتياج غير مغطى`}`, { bold: true }),
      ...coverage.uncovered_needs.map((n) => p(`غير مغطى (${n.domain}) — ${n.need} | الهدف المقترح: ${n.suggested_goal}`)),
    ] : []),
    ...(sections.revisions ? [p("جدول تتبع التعديلات المباشرة", { heading: HeadingLevel.HEADING_1 }), new Table({
      visuallyRightToLeft: true,
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ tableHeader: true, children: ["المجال", "الهدف الأصلي", "الهدف بعد التعديل", "تصنيف التعديل", "سبب التعديل والقاعدة الفنية المطبقة"].map((h) => cell(h, true)) }),
        ...report.revisions.map(
          (r) =>
            new TableRow({
              children: [r.domain, r.original_goal, r.revised_goal, r.revision_category, `${r.rationale} (${r.standards_violated.join("، ")})`].map((t) => cell(t)),
            }),
        ),
      ],
    })] : []),
    ...(sections.categories ? [
      p("التصنيف الثلاثي لتعديلات الأهداف", { heading: HeadingLevel.HEADING_1 }),
      ...REVISION_CATEGORIES.flatMap((category) => [
        p(category, { bold: true }),
        ...report.revisions.filter((revision) => revision.revision_category === category).map((revision) => p(revision.revised_goal)),
      ]),
    ] : []),
    ...(sections.recommendations ? [
      p("التوصيات الإشرافية النهائية وتوجيهات الاعتماد", { heading: HeadingLevel.HEADING_1 }),
      ...report.recommendations.map((t, i) => p(`${i + 1}. ${t}`)),
    ] : []),
  ];

  const doc = new Document({ sections: [{ children }] });
  download(await Packer.toBlob(doc), `${fileBase(report)}.docx`);
}
