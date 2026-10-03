import { createFileRoute } from "@tanstack/react-router";

import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CheckSquare2,
  CircleDashed,
  Download,
  FileText,
  FileUp,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";

import { auditIep } from "@/lib/iep-audit.functions";
import {
  IEP_DOMAINS,
  REVISION_CATEGORIES,
  type IepAuditReport,
} from "@/lib/iep-schema";
import { extractTextFromFile } from "@/lib/parse-document";
import {
  DEFAULT_REPORT_SECTIONS,
  REPORT_SECTION_OPTIONS,
  exportDocx,
  exportJson as exportJsonFile,
  exportPdf,
  type ReportSectionId,
  type ReportSections,
} from "@/lib/export-report";
import { ReportEditor } from "@/components/ReportEditor";
import { Pencil } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      {
        title: "محرك مراجعة وتدقيق الخطط التربوية الفردية",
      },
      {
        name: "description",
        content:
          "محرك تدقيق حتمي للخطط التربوية الفردية: تدقيق مزدوج على مستوى الأهداف الفردية والهندسة الكلية للخطة وفق معايير الجودة الـ 24.",
      },
      {
        property: "og:title",
        content: "محرك مراجعة وتدقيق الخطط التربوية الفردية",
      },
      {
        property: "og:description",
        content:
          "تدقيق مزدوج حتمي: جودة الأهداف الفردية + الهندسة الكلية للخطة وفق المعايير الـ 24 والأسئلة الجوهرية الستة.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type AuditResult = {
  report: IepAuditReport;
  parity: { bannedWordsStripped: number; singleCriterionFixes?: number };
};

type Phase = "idle" | "extracting" | "auditing" | "done";

const PILLARS: { key: keyof IepAuditReport["checklist_24_standards_status"]; label: string }[] = [
  { key: "pillar_1_plaafp", label: "الركيزة 1 — مستوى الأداء الحالي (PLAAFP)" },
  { key: "pillar_2_smart_goals", label: "الركيزة 2 — الأهداف الذكية SMART" },
  { key: "pillar_3_admin", label: "الركيزة 3 — الجوانب الإدارية والتنظيمية" },
  { key: "pillar_4_transition", label: "الركيزة 4 — خطة الانتقال" },
  { key: "items_13_7_to_13_11_plan_engineering", label: "البند 13-7 إلى 13-11 — هندسة الخطة الكلية" },
];

function statusTone(text: string): "pass" | "partial" | "fail" {
  if (text.startsWith("غير مستوفٍ")) return "fail";
  if (text.startsWith("مستوفٍ جزئياً")) return "partial";
  return "pass";
}

function Index() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fileInfo, setFileInfo] = useState<{ name: string; size: number; chars: number } | null>(null);
  const [docText, setDocText] = useState<string | null>(null);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [domainFilter, setDomainFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [dragOver, setDragOver] = useState(false);
  const [editing, setEditing] = useState(false);
  const [selectingSections, setSelectingSections] = useState(false);
  const [reportSections, setReportSections] = useState<ReportSections>(() => ({ ...DEFAULT_REPORT_SECTIONS }));
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    setResult(null);
    const name = file.name.toLowerCase();
    if (!/\.(pdf|docx|txt|md)$/.test(name)) {
      setError("صيغة غير مدعومة. المسموح: PDF أو DOCX أو TXT.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("حجم الملف يتجاوز 20 ميجابايت.");
      return;
    }
    setPhase("extracting");
    try {
      const text = await extractTextFromFile(file);
      if (text.trim().length < 40) {
        throw new Error("لم يتم استخراج نص كافٍ من المستند — قد يكون ممسوحاً ضوئياً كصورة.");
      }
      setDocText(text);
      setFileInfo({ name: file.name, size: file.size, chars: text.length });
      setPhase("idle");
    } catch (e) {
      setPhase("idle");
      setError(e instanceof Error ? e.message : "فشل قراءة المستند.");
    }
  }

  async function startAudit() {
    if (!docText || !fileInfo) return;
    setPhase("auditing");
    setError(null);
    try {
      const resp = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentName: fileInfo.name, documentText: docText }),
      });
      if (!resp.ok || !resp.body) {
        const j = await resp.json().catch(() => null);
        throw new Error(j?.error ?? `فشل التدقيق (${resp.status})`);
      }
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let res: Awaited<ReturnType<typeof auditIep>> | null = null;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (!line) continue;
          const msg = JSON.parse(line);
          if (msg.type === "error") throw new Error(msg.message);
          if (msg.type === "result") res = msg.data;
        }
      }
      if (!res) throw new Error("انقطع الاتصال قبل اكتمال التدقيق. أعد المحاولة.");
      setResult(res);
      setPhase("done");
      requestAnimationFrame(() =>
        document.getElementById("results")?.scrollIntoView({ behavior: "smooth" }),
      );
    } catch (e) {
      setPhase("idle");
      const msg = e instanceof Error ? e.message : "فشل التدقيق.";
      setError(
        /402/i.test(msg)
          ? "رصيد الذكاء الاصطناعي غير كافٍ — يمكن التحقق من الرصيد من إعدادات المساحة."
          : /403|401/i.test(msg)
            ? "تم رفض طلب التدقيق من مزوّد النموذج — أعد المحاولة لاحقاً بعد استعادة الوصول."
            : msg,
      );
    }
  }

  function reset() {
    setPhase("idle");
    setError(null);
    setDocText(null);
    setFileInfo(null);
    setResult(null);
    setDomainFilter("all");
    setCategoryFilter("all");
    setSelectingSections(false);
    setReportSections({ ...DEFAULT_REPORT_SECTIONS });
    if (inputRef.current) inputRef.current.value = "";
  }

  const filteredRevisions = useMemo(() => {
    if (!result) return [];
    return result.report.revisions.filter(
      (r) =>
        (domainFilter === "all" || r.domain === domainFilter) &&
        (categoryFilter === "all" || r.revision_category === categoryFilter),
    );
  }, [result, domainFilter, categoryFilter]);

  const busy = phase === "extracting" || phase === "auditing";

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight sm:text-xl">
                محرك مراجعة وتدقيق الخطط التربوية الفردية
              </h1>
              <p className="text-xs text-muted-foreground sm:text-sm">
                IEP Review &amp; Engineering Engine — مراجعة مزدوجة حتمية وفق معايير الجودة الـ 24
              </p>
            </div>
          </div>
          {result && (
            <div className="flex shrink-0 flex-wrap gap-2 print:hidden">
              <button
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <Pencil className="h-4 w-4" />
                تعديل التقرير
              </button>
              <button
                onClick={() => setSelectingSections((current) => !current)}
                aria-pressed={selectingSections}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${selectingSections ? "border-primary bg-primary/10 text-primary" : "border-input bg-background hover:bg-accent"}`}
              >
                <CheckSquare2 className="h-4 w-4" />
                تحديد مكونات التقرير
              </button>
              {[
                { label: "PDF", fn: () => exportPdf() },
                { label: "DOCX", fn: () => void exportDocx(result.report, reportSections) },
                { label: "JSON", fn: () => exportJsonFile(result, result.report, reportSections) },
              ].map((b) => (
                <button
                  key={b.label}
                  onClick={b.fn}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
                >
                  <Download className="h-4 w-4" />
                  {b.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {/* Upload */}
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7 print:hidden">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <FileUp className="h-5 w-5 text-primary" />
            ارفع الخطة التربوية الفردية
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            الصيغ المدعومة: PDF و DOCX و TXT — حتى 20 ميجابايت.
          </p>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) void handleFile(file);
            }}
            onClick={() => !busy && inputRef.current?.click()}
            className={`mt-4 cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
              dragOver ? "border-primary bg-accent" : "border-border hover:border-primary/50 hover:bg-accent/40"
            } ${busy ? "pointer-events-none opacity-60" : ""}`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.docx,.txt,.md"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            {phase === "extracting" ? (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm">جارٍ قراءة المستند واستخراج النص…</p>
              </div>
            ) : fileInfo ? (
              <div className="flex flex-col items-center gap-1">
                <FileText className="h-8 w-8 text-primary" />
                <p className="font-medium">{fileInfo.name}</p>
                <p className="text-sm text-muted-foreground">
                  {(fileInfo.size / 1024).toFixed(0)} كيلوبايت — {fileInfo.chars.toLocaleString("en-US")} حرفاً مستخرجاً
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1 text-muted-foreground">
                <FileUp className="h-8 w-8" />
                <p className="text-sm font-medium text-foreground">اسحب الملف هنا أو انقر للاختيار</p>
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={() => void startAudit()}
              disabled={!docText || busy}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {phase === "auditing" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جارٍ تنفيذ المراجعة المزدوجة…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  بدء التدقيق
                </>
              )}
            </button>
            {fileInfo && (
              <button
                onClick={reset}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg border border-input bg-background px-4 py-2.5 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" />
                مستند جديد
              </button>
            )}
          </div>

          {phase === "auditing" && (
            <div className="mt-4 rounded-lg border border-border bg-accent/40 px-4 py-3 text-sm text-accent-foreground">
              يجري المحرك الآن المراجعة المزدوجة: تدقيق الأهداف الفردية (المستوى 1) ثم الهندسة الكلية
              للخطة (المستوى 2). قد تستغرق العملية دقيقة إلى ثلاث دقائق حسب طول الخطة.
            </div>
          )}

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </section>

        {result && selectingSections && (
          <section className="mt-6 rounded-xl border border-primary/30 bg-card p-4 print:hidden">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold">مكونات التقرير</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">انقر على أي إطار في التقرير أو استخدم الخيارات التالية لتضمينه أو استبعاده.</p>
              </div>
              <button onClick={() => setSelectingSections(false)} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">تم الاختيار</button>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {REPORT_SECTION_OPTIONS.map((section) => (
                <label key={section.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${reportSections[section.id] ? "border-primary bg-primary/10" : "border-border bg-background text-muted-foreground"}`}>
                  <input
                    type="checkbox"
                    checked={reportSections[section.id]}
                    onChange={() => setReportSections((current) => ({ ...current, [section.id]: !current[section.id] }))}
                    className="h-4 w-4 accent-primary"
                  />
                  {section.label}
                </label>
              ))}
            </div>
          </section>
        )}
        {result && <AuditReportView result={result} filteredRevisions={filteredRevisions} domainFilter={domainFilter} categoryFilter={categoryFilter} setDomainFilter={setDomainFilter} setCategoryFilter={setCategoryFilter} reportSections={reportSections} selectingSections={selectingSections} onToggleSection={(id) => setReportSections((current) => ({ ...current, [id]: !current[id] }))} />}
        {result && editing && (
          <ReportEditor
            report={result.report}
            onClose={() => setEditing(false)}
            onSave={(r) => {
              setResult({ ...result, report: r });
              setEditing(false);
            }}
          />
        )}
      </main>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        مخرجات حتمية وفق العقد الصارم: مخطط JSON موحد + مصفوفة القواعد الموحدة + تحقق كودي بعد التوليد.
      </footer>
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const circumference = 2 * Math.PI * 52;
  const offset = circumference * (1 - clamped / 100);
  const color = clamped >= 75 ? "var(--color-chart-2)" : clamped >= 50 ? "var(--color-chart-4)" : "var(--color-destructive)";
  return (
    <div className="relative h-36 w-36">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r="52" fill="none" stroke="var(--color-muted)" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r="52"
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold">{clamped}%</span>
        <span className="text-xs text-muted-foreground">درجة التكامل</span>
      </div>
    </div>
  );
}

function StatusIcon({ tone }: { tone: "pass" | "partial" | "fail" }) {
  if (tone === "pass") return <CheckCircle2 className="h-5 w-5 shrink-0 text-chart-2" />;
  if (tone === "partial") return <CircleDashed className="h-5 w-5 shrink-0 text-chart-4" />;
  return <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />;
}

function AuditReportView({
  result,
  filteredRevisions,
  domainFilter,
  categoryFilter,
  setDomainFilter,
  setCategoryFilter,
  reportSections,
  selectingSections,
  onToggleSection,
}: {
  result: AuditResult;
  filteredRevisions: AuditResult["report"]["revisions"];
  domainFilter: string;
  categoryFilter: string;
  setDomainFilter: (v: string) => void;
  setCategoryFilter: (v: string) => void;
  reportSections: ReportSections;
  selectingSections: boolean;
  onToggleSection: (id: ReportSectionId) => void;
}) {
  const { report, parity } = result;
  const { macro_plan_engineering: macro, micro_audit_summary: summary, checklist_24_standards_status: checklist } = report;
  const [tab, setTab] = useState<"revisions" | "mapping" | "categories">("revisions");
  const tones = PILLARS.map((p) => statusTone(checklist[p.key]));
  const complianceRate = Math.round(
    (tones.reduce((n, t) => n + (t === "pass" ? 1 : t === "partial" ? 0.5 : 0), 0) / tones.length) * 100,
  );
  const q = macro.horizontal_analysis_6_questions;
  const overviewItems = [
    {
      label: "ترابط مجالات وأهداف الخطة",
      text: `${q.q1_horizontal_bundling}\n${q.q2_cross_domain_integration}\n${q.q6_scattered_goals_detected}`,
    },
    { label: "التسلسل المنطقي للخطة", text: q.q3_sequential_logic },
    { label: "الأثر المتوقع في حياة المتعلم", text: q.q4_observable_life_impact },
    { label: "الجاهزية لما بعد التخرج", text: q.q5_post_graduation_readiness },
  ];
  const uncoveredNeeds = report.need_goal_mapping.filter((item) => !item.covering_goal);
  const sectionClass = (id: ReportSectionId) =>
    `${reportSections[id] ? "" : "print:hidden"} ${selectingSections ? `cursor-pointer transition-all ${reportSections[id] ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "opacity-45 ring-2 ring-border"}` : ""}`;
  const sectionProps = (id: ReportSectionId) => ({
    onClick: selectingSections ? () => onToggleSection(id) : undefined,
    onKeyDown: selectingSections ? (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onToggleSection(id);
      }
    } : undefined,
    role: selectingSections ? "checkbox" : undefined,
    "aria-checked": selectingSections ? reportSections[id] : undefined,
    tabIndex: selectingSections ? 0 : undefined,
  });

  return (
    <div id="results" className="mt-8 space-y-8">
      {/* Summary strip */}
      <section {...sectionProps("summary")} className={`grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7 ${sectionClass("summary")}`}>
        {[
          { label: "الطالب", value: summary.student_name || "غير محدد" },
          { label: "العمر", value: summary.age != null ? `${summary.age} سنة` : "غير محدد" },
          { label: "نوع الإعاقة", value: summary.disability_type || "غير محدد" },
          { label: "الأهداف المراجَعة", value: String(summary.total_goals_reviewed) },
          { label: "درجة الجودة الكلية", value: `${summary.quality_score_24_standards} / 100` },
          { label: "نسبة الامتثال للمعايير الـ 24", value: `${complianceRate}%` },
          { label: "تغطية الاحتياجات", value: summary.plaafp_coverage_complete ? "مكتملة" : "غير مكتملة" },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-border bg-card p-3 text-center shadow-sm">
            <p className="text-[11px] text-muted-foreground">{item.label}</p>
            <p className="mt-1 truncate text-sm font-semibold" title={item.value}>
              {item.value}
            </p>
          </div>
        ))}
      </section>

      {/* Section 1: Macro */}
      <section {...sectionProps("overview")} className={`overflow-hidden rounded-2xl border border-border bg-card shadow-sm ${sectionClass("overview")}`}>
        <div className="flex items-center gap-2 border-b border-border bg-accent/40 px-5 py-3">
          <Target className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">قسم 1 — الرؤية العامة</h2>
        </div>
        <div className="p-5">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
            <ScoreRing score={macro.integration_score_percent} />
            <div className="flex-1 space-y-3">
              <div className="rounded-lg border border-border bg-background px-4 py-3">
                <p className="text-xs text-muted-foreground">مسار المهارات المهنية</p>
                <p className="mt-1 font-semibold">{macro.target_functional_role || "لم يُحدد"}</p>
              </div>
              <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
                <p className="text-xs text-primary">توصيات الرؤية العامة</p>
                <p className="mt-1 text-sm leading-relaxed">{macro.macro_recommendation}</p>
              </div>
            </div>
          </div>

          <h3 className="mt-6 mb-3 text-sm font-semibold text-muted-foreground">
            محاور الرؤية العامة
          </h3>
          <div className="grid gap-3 md:grid-cols-2">
            {overviewItems.map((item, i) => (
              <div key={item.label} className="rounded-lg border border-border bg-background p-4">
                <p className="text-sm font-semibold">
                  <span className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                    {i + 1}
                  </span>
                  {item.label}
                </p>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 print:hidden" role="tablist">
        {[
          { id: "revisions", label: "جدول تتبع التعديلات" },
          { id: "mapping", label: "مصفوفة تغطية الاحتياجات" },
          { id: "categories", label: "تصنيف التعديلات الثلاثي" },
        ].map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id as typeof tab)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${tab === t.id ? "bg-primary text-primary-foreground" : "border border-input bg-card hover:bg-accent"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className={tab === "revisions" ? "" : "hidden print:block"}>
      {/* Section 2: Micro audit table */}
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-accent/40 px-5 py-3">
          <h2 className="font-semibold">جدول تتبع التعديلات ({report.revisions.length} هدفاً)</h2>
          <div className="flex flex-wrap gap-2">
            <select
              value={domainFilter}
              onChange={(e) => setDomainFilter(e.target.value)}
              className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
            >
              <option value="all">كل المجالات</option>
              {IEP_DOMAINS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
            >
              <option value="all">كل التصنيفات</option>
              {REVISION_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-right text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">المجال</th>
                <th className="px-4 py-2.5 font-medium">الهدف الأصلي</th>
                <th className="px-4 py-2.5 font-medium">الهدف المعدل</th>
                <th className="px-4 py-2.5 font-medium">تصنيف التعديل</th>
                <th className="px-4 py-2.5 font-medium">سبب التعديل والمعيار</th>
              </tr>
            </thead>
            <tbody>
              {filteredRevisions.map((r, i) => (
                <tr key={i} className="border-t border-border align-top">
                  <td className="whitespace-nowrap px-4 py-3 font-medium">{r.domain}</td>
                  <td className="px-4 py-3 leading-relaxed text-muted-foreground">{r.original_goal}</td>
                  <td className="px-4 py-3 leading-relaxed">{r.revised_goal}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="inline-block rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                      {r.revision_category}
                    </span>
                  </td>
                  <td className="px-4 py-3 leading-relaxed text-muted-foreground">
                    {r.rationale}
                    {r.standards_violated.length > 0 && (
                      <span className="mt-1.5 flex flex-wrap gap-1">
                        {r.standards_violated.map((s, j) => (
                          <span key={j} className="rounded border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 text-[11px] text-destructive">
                            {s}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {filteredRevisions.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    لا توجد تعديلات مطابقة للتصفية الحالية.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {(parity.bannedWordsStripped > 0 || (parity.singleCriterionFixes ?? 0) > 0) && (
          <p className="border-t border-border bg-muted/40 px-5 py-2.5 text-xs text-muted-foreground">
            تطبيق مصفوفة القواعد الموحدة:
            {parity.bannedWordsStripped > 0 &&
              ` تم حذف ${parity.bannedWordsStripped} كلمة ضمنية محظورة من الأهداف المعدلة.`}
            {(parity.singleCriterionFixes ?? 0) > 0 &&
              ` تم توحيد معيار القياس في ${parity.singleCriterionFixes} هدفاً بحذف المقاييس المزدوجة.`}
          </p>
        )}
      </section>

      </div>
      <div className={tab === "mapping" ? "" : "hidden print:block"}>
      {/* Section 3: Need-to-goal mapping */}
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b border-border bg-accent/40 px-5 py-3">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">مصفوفة تغطية الاحتياجات (PLAAFP ← أهداف)</h2>
        </div>
        <div className="p-5">
          <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${summary.plaafp_coverage_complete ? "border-chart-2/40 bg-chart-2/10" : "border-destructive/30 bg-destructive/10"}`}>
            <StatusIcon tone={summary.plaafp_coverage_complete ? "pass" : "fail"} />
            <p className="text-sm font-medium">
              {summary.plaafp_coverage_complete
                ? "جميع الاحتياجات المسجلة في مستوى الأداء الحالي مغطاة بأهداف محددة."
                : "توجد احتياجات غير مغطاة بأهداف — يجب توليد أهداف لها وفق قاعدة التغطية الكاملة."}
            </p>
          </div>
          {report.need_goal_mapping.length > 0 && (
            <ul className="mt-3 space-y-2">
              {report.need_goal_mapping.map((n, i) => (
                <li
                  key={i}
                  className={`grid gap-2 rounded-lg border px-4 py-2.5 text-sm md:grid-cols-[1fr_auto_1fr] md:items-center ${n.covering_goal ? "border-chart-2/40 bg-chart-2/5" : "border-destructive/40 bg-destructive/10 text-destructive"}`}
                >
                  <span className="flex items-start gap-2">
                    <StatusIcon tone={n.covering_goal ? "pass" : "fail"} />
                    <span>
                      <span className="block text-[11px] opacity-70">{n.domain}</span>
                      {n.need}
                    </span>
                  </span>
                  <span className="hidden text-muted-foreground md:block">←</span>
                  <span className={n.covering_goal ? "text-muted-foreground" : "font-semibold"}>
                    {n.covering_goal ?? "لا يوجد هدف مغطٍّ"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {report.need_goal_mapping.length === 0 && summary.unmapped_needs.length > 0 && (
            <ul className="mt-3 space-y-2">
              {summary.unmapped_needs.map((need, i) => (
                <li key={i} className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-2.5 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <span>احتياج غير مغطى: {need}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      </div>
      <div className={tab === "categories" ? "space-y-4" : "hidden print:block print:space-y-4"}>
        {REVISION_CATEGORIES.map((cat) => {
          const items = report.revisions.filter((r) => r.revision_category === cat);
          return (
            <section key={cat} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <div className="flex items-center justify-between border-b border-border bg-accent/40 px-5 py-3">
                <h2 className="font-semibold">{cat}</h2>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${items.length >= 3 ? "bg-chart-2/15 text-chart-2" : "bg-destructive/10 text-destructive"}`}>
                  {items.length} أمثلة {items.length < 3 && "— أقل من الحد الأدنى (3)"}
                </span>
              </div>
              <ul className="divide-y divide-border">
                {items.map((r, i) => (
                  <li key={i} className="space-y-1.5 px-5 py-3 text-sm">
                    <p className="text-[11px] text-muted-foreground">{r.domain}</p>
                    <p className="text-muted-foreground line-through decoration-destructive/40">{r.original_goal}</p>
                    <p className="font-medium">{r.revised_goal}</p>
                    <p className="text-xs text-muted-foreground">{r.rationale}</p>
                  </li>
                ))}
                {items.length === 0 && <li className="px-5 py-4 text-sm text-muted-foreground">لا توجد أمثلة.</li>}
              </ul>
            </section>
          );
        })}
      </div>

      {/* Section 4: 24 standards checklist */}
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b border-border bg-accent/40 px-5 py-3">
          <CheckCircle2 className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">قسم 4 — قائمة معايير الجودة الـ 24 (الركائز 1-4 + البنود 13-7 إلى 13-11)</h2>
        </div>
        <ul className="divide-y divide-border">
          {PILLARS.map((p) => {
            const text = checklist[p.key];
            const tone = statusTone(text);
            return (
              <li key={p.key} className="flex items-start gap-3 px-5 py-4">
                <StatusIcon tone={tone} />
                <div>
                  <p className="text-sm font-semibold">{p.label}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {report.recommendations.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex items-center gap-2 border-b border-border bg-accent/40 px-5 py-3">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">التوصيات</h2>
          </div>
          <ol className="list-decimal space-y-2 px-10 py-4 text-sm leading-relaxed">
            {report.recommendations.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
