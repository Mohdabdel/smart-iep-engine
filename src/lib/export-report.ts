import type { IepAuditReport } from "./iep-schema";

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

export function exportJson(data: unknown, report: IepAuditReport) {
  download(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), `${fileBase(report)}.json`);
}

/** PDF via the browser print dialog — keeps Arabic RTL shaping intact. */
export function exportPdf() {
  window.print();
}

export async function exportDocx(report: IepAuditReport) {
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

  const children = [
    p("تقرير تدقيق الخطة التربوية الفردية", { heading: HeadingLevel.TITLE }),
    p(`الطالب: ${s.student_name} — العمر: ${s.age ?? "غير محدد"} — نوع الإعاقة: ${s.disability_type}`),
    p(`الأهداف المراجعة: ${s.total_goals_reviewed} — درجة الجودة: ${s.quality_score_24_standards}% — تغطية الاحتياجات: ${s.plaafp_coverage_complete ? "مكتملة" : "غير مكتملة"}`),
    p("الهندسة الكلية للخطة", { heading: HeadingLevel.HEADING_1 }),
    p(`درجة التكامل: ${m.integration_score_percent}% — الدور الوظيفي: ${m.target_functional_role}`),
    ...[q.q1_horizontal_bundling, q.q2_cross_domain_integration, q.q3_sequential_logic, q.q4_observable_life_impact, q.q5_post_graduation_readiness, q.q6_scattered_goals_detected].map((t, i) => p(`${i + 1}. ${t}`)),
    p(`التوصية: ${m.macro_recommendation}`, { bold: true }),
    p("جدول تتبع التعديلات", { heading: HeadingLevel.HEADING_1 }),
    new Table({
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
    }),
    p("مصفوفة تغطية الاحتياجات", { heading: HeadingLevel.HEADING_1 }),
    ...report.need_goal_mapping.map((n) => p(`${n.covering_goal ? "✔" : "✘ غير مغطى"} — ${n.need} ← ${n.covering_goal ?? "لا يوجد هدف"}`)),
    p("معايير الجودة الـ 24", { heading: HeadingLevel.HEADING_1 }),
    ...[c.pillar_1_plaafp, c.pillar_2_smart_goals, c.pillar_3_admin, c.pillar_4_transition, c.items_13_7_to_13_11_plan_engineering].map((t) => p(t)),
    p("التوصيات", { heading: HeadingLevel.HEADING_1 }),
    ...report.recommendations.map((t, i) => p(`${i + 1}. ${t}`)),
  ];

  const doc = new Document({ sections: [{ children }] });
  download(await Packer.toBlob(doc), `${fileBase(report)}.docx`);
}
