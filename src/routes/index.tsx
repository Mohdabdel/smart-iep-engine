import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Award,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileJson,
  FileText,
  ListChecks,
  Loader2,
  Map as MapIcon,
  Pencil,
  Printer,
  ShieldCheck,
  Sparkles,
  Upload,
  XCircle,
} from "lucide-react";
import { extractTextFromFile } from "@/lib/parse-document";

type ParsedDocument = { name: string; text: string };
import { FROZEN_ITEMS, PILLAR_MAX_SCORES, REVISION_CATEGORIES, type AuditScope, type IepAuditReport } from "@/lib/iep-schema";
import { DEFAULT_REPORT_SECTIONS, PILLAR_LABELS, REPORT_SECTION_OPTIONS, exportDocx, exportJson, exportPdf, type ReportSections } from "@/lib/export-report";
import { ReportEditor } from "@/components/ReportEditor";

export const Route = createFileRoute("/")({
  component: Home,
  head: () => ({
    meta: [
      { title: "محرك مراجعة وتدقيق الخطط التربوية الفردية" },
      { name: "description", content: "محرك ذكاء اصطناعي حتمي للمراجعة المزدوجة للخطط التربوية الفردية: تقييم رقمي للبنود الفعّالة (19)، رؤية عامة للخطة، مصفوفة تغطية الاحتياجات، وتصدير PDF/DOCX/JSON." },
      { property: "og:title", content: "محرك مراجعة وتدقيق الخطط التربوية الفردية" },
      { property: "og:description", content: "مراجعة مزدوجة حتمية للخطط التربوية الفردية مع تقييم رقمي للبنود الفعّالة (19) وتصدير PDF/DOCX/JSON." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type AuditResult = { report: IepAuditReport; parity: { bannedWordsStripped: number; singleCriterionFixes: number } };
type Stage = "idle" | "parsing" | "auditing";

const SAVED_REPORT_KEY = "iep-audit:last-report";
type SavedReport = { result: AuditResult; fileInfo: { name: string; textLength: number } | null; reportSections: ReportSections };

async function runAudit(document: ParsedDocument, scope: AuditScope): Promise<AuditResult> {
  const response = await fetch("/api/audit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documentName: document.name, documentText: document.text, scope }),
  });
  if (!response.ok || !response.body) throw new Error("تعذر الاتصال بمحرك التدقيق.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const message = JSON.parse(line) as
        | { type: "result"; data: { report: IepAuditReport; parity: AuditResult["parity"] } }
        | { type: "error"; message?: string; error?: string };
      if (message.type === "error") throw new Error(message.message ?? message.error ?? "فشل التدقيق.");
      if (message.type === "result") return { report: message.data.report, parity: message.data.parity };
    }
  }
  throw new Error("انقطع الاتصال قبل اكتمال التقرير. أعد المحاولة.");
}

function Home() {
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fileInfo, setFileInfo] = useState<{ name: string; textLength: number } | null>(null);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [restored, setRestored] = useState(false);
  const [reportSections, setReportSections] = useState<ReportSections>(DEFAULT_REPORT_SECTIONS);
  const [selectingSections, setSelectingSections] = useState(false);
  const [editing, setEditing] = useState(false);
  const [exporting, setExporting] = useState<null | "docx" | "json">(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVED_REPORT_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as SavedReport;
      if (!saved.result?.report?.level1_quality_standards) return;
      setResult(saved.result);
      setFileInfo(saved.fileInfo ?? null);
      setReportSections({ ...DEFAULT_REPORT_SECTIONS, ...(saved.reportSections ?? {}) });
      setRestored(true);
    } catch {
      /* corrupted entry — ignore */
    }
  }, []);

  useEffect(() => {
    if (!result) return;
    try {
      localStorage.setItem(SAVED_REPORT_KEY, JSON.stringify({ result, fileInfo, reportSections }));
    } catch {
      /* quota exceeded — ignore */
    }
  }, [result, fileInfo, reportSections]);

  const [scope, setScope] = useState<AuditScope>("both");

  async function handleFile(file: File) {
    setError(null);
    setResult(null);
    setRestored(false);
    setEditing(false);
    setStage("parsing");
    try {
      const parsed: ParsedDocument = { name: file.name, text: await extractTextFromFile(file) };
      setFileInfo({ name: parsed.name, textLength: parsed.text.length });
      setStage("auditing");
      const res = await runAudit(parsed, scope);
      setReportSections((prev) => ({
        ...prev,
        ...(scope === "level1" ? { overview: false, revisions: false, mapping: false, categories: false } : {}),
        ...(scope === "level2" ? { standards: false } : {}),
      }));
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ غير متوقع.");
      setFileInfo(null);
    } finally {
      setStage("idle");
    }
  }

  function reset() {
    setResult(null);
    setFileInfo(null);
    setError(null);
    setRestored(false);
    setSelectingSections(false);
    setEditing(false);
    setReportSections(DEFAULT_REPORT_SECTIONS);
    try {
      localStorage.removeItem(SAVED_REPORT_KEY);
    } catch {
      /* ignore */
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  const busy = stage !== "idle";

  return (
    <main dir="rtl" className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/60 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-lg font-bold leading-tight">محرك مراجعة وتدقيق الخطط التربوية الفردية</h1>
              <p className="text-xs text-muted-foreground">مراجعة مزدوجة حتمية — تقييم رقمي للبنود الفعّالة (19) + مراجعة إشرافية إضافية</p>
            </div>
          </div>
          {result && (
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-2 text-sm hover:bg-accent">
                <Pencil className="h-4 w-4" /> تعديل التقرير
              </button>
              <button
                onClick={() => setSelectingSections((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm ${selectingSections ? "border-primary bg-primary/10 text-primary" : "border-input hover:bg-accent"}`}
              >
                <ListChecks className="h-4 w-4" /> تحديد مكونات التقرير
              </button>
              <button onClick={() => exportPdf()} className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-2 text-sm hover:bg-accent">
                <Printer className="h-4 w-4" /> طباعة / PDF
              </button>
              <button
                disabled={exporting !== null}
                onClick={async () => {
                  setExporting("docx");
                  try {
                    await exportDocx(result.report, reportSections);
                  } finally {
                    setExporting(null);
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
              >
                {exporting === "docx" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Word
              </button>
              <button
                disabled={exporting !== null}
                onClick={() => {
                  setExporting("json");
                  try {
                    exportJson(result, result.report, reportSections);
                  } finally {
                    setExporting(null);
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
              >
                <FileJson className="h-4 w-4" /> JSON
              </button>
              <button onClick={reset} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
                <Upload className="h-4 w-4" /> مستند جديد
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8">
        {!result && (
          <section className="mx-auto max-w-2xl space-y-6">
            <div className="space-y-2 text-center">
              <h2 className="text-2xl font-bold">ارفع الخطة التربوية الفردية لبدء التدقيق</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                يحلل المحرك المستند وفق المراجعة المزدوجة: تقييم رقمي للمعايير الرسمية الـ 24 مع قرار اعتماد، ومراجعة إشرافية للرؤية العامة ومصفوفة تغطية الاحتياجات، ثم يُخرج تقريراً كاملاً قابلاً للتعديل والتصدير.
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">نطاق المراجعة</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {([
                  { id: "both", t: "المستويان معاً", d: "مراجعة كاملة" },
                  { id: "level1", t: "المستوى الأول فقط", d: "التقييم الرقمي لمعايير الجودة" },
                  { id: "level2", t: "المستوى الثاني فقط", d: "الرؤية العامة وتعديل الأهداف" },
                ] as const).map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    disabled={busy}
                    onClick={() => setScope(o.id)}
                    className={`rounded-xl border p-3 text-right transition-colors ${scope === o.id ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted"}`}
                  >
                    <p className="text-sm font-bold">{o.t}</p>
                    <p className="text-xs text-muted-foreground">{o.d}</p>
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">تنفيذ مستوى واحد يختصر زمن المراجعة.</p>
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f && !busy) void handleFile(f);
              }}
              className={`rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-border bg-card"}`}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.docx,.txt"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                }}
              />
              {busy ? (
                <div className="space-y-3">
                  <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
                  <p className="font-medium">{stage === "parsing" ? "جارٍ قراءة المستند…" : "جارٍ تنفيذ المراجعة المزدوجة…"}</p>
                  {stage === "auditing" && <p className="text-xs text-muted-foreground">قد يستغرق التدقيق الكامل حتى دقيقتين تقريباً — لا تغلق الصفحة.</p>}
                </div>
              ) : (
                <div className="space-y-3">
                  <FileText className="mx-auto h-10 w-10 text-muted-foreground" />
                  <p className="font-medium">اسحب الملف هنا أو اختره من جهازك</p>
                  <p className="text-xs text-muted-foreground">PDF أو Word (DOCX) أو نص (TXT)</p>
                  <button onClick={() => inputRef.current?.click()} className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90">
                    اختيار ملف
                  </button>
                </div>
              )}
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { icon: ClipboardCheck, t: "تقييم رقمي حتمي", d: "درجة من 19 ونسبة امتثال وقرار اعتماد وفق المعايير الرسمية" },
                { icon: Sparkles, t: "مراجعة إشرافية إضافية", d: "رؤية عامة للخطة، أهداف معدلة مصنفة، ومصفوفة تغطية الاحتياجات" },
                { icon: Download, t: "تصدير مرن", d: "تعديل التقرير ثم طباعته أو تصديره PDF وWord وJSON بأقسام مختارة" },
              ].map(({ icon: Icon, t, d }) => (
                <div key={t} className="rounded-xl border border-border bg-card p-4">
                  <Icon className="mb-2 h-5 w-5 text-primary" />
                  <p className="text-sm font-semibold">{t}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{d}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {result && (
          <div className="space-y-6">
            {restored && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-center text-xs text-muted-foreground print:hidden">
                تمت استعادة آخر تقرير محفوظ تلقائياً — اضغط «مستند جديد» لبدء تدقيق جديد.
              </div>
            )}
            {selectingSections && (
              <div className="rounded-xl border border-primary/40 bg-primary/5 p-4 print:hidden">
                <p className="mb-3 text-sm font-semibold">حدد الأقسام التي تريد تضمينها في الطباعة والتصدير:</p>
                <div className="flex flex-wrap gap-2">
                  {REPORT_SECTION_OPTIONS.map(({ id, label }) => (
                    <label
                      key={id}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${reportSections[id] ? "border-primary bg-primary/10 font-medium text-primary" : "border-input bg-background"}`}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-primary"
                        checked={reportSections[id]}
                        onChange={(e) => setReportSections({ ...reportSections, [id]: e.target.checked })}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <AuditReportView result={result} fileInfo={fileInfo} reportSections={reportSections} />
          </div>
        )}
      </div>

      {editing && result && (
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
  );
}

function ScoreRing({ percent, label, sub }: { percent: number; label: string; sub: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 84 84" className="h-20 w-20 -rotate-90">
        <circle cx="42" cy="42" r={r} fill="none" strokeWidth="8" className="stroke-muted" />
        <circle
          cx="42"
          cy="42"
          r={r}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * Math.min(100, Math.max(0, percent))) / 100}
          className="stroke-primary transition-all"
        />
      </svg>
      <div>
        <p className="text-2xl font-bold tabular-nums">{percent}%</p>
        <p className="text-xs font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
    </div>
  );
}

function Section({ title, children, hidden }: { title: string; children: React.ReactNode; hidden?: boolean }) {
  if (hidden) return null;
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-5 print:break-inside-avoid">
      <h2 className="text-base font-bold">{title}</h2>
      {children}
    </section>
  );
}

function AuditReportView({ result, fileInfo, reportSections }: { result: AuditResult; fileInfo: { name: string; textLength: number } | null; reportSections: ReportSections }) {
  const { report } = result;
  const s = report.student_info;
  const l1 = report.level1_quality_standards;
  const vision = report.level2_supervisory_review.overall_vision;
  const coverage = report.level2_supervisory_review.needs_coverage;
  const decisionOk = l1.accreditation_decision === "معتمدة";
  const decisionMid = l1.accreditation_decision === "معتمدة بشرط التعديل";

  const visionItems: { label: string; text: string }[] = [
    { label: "الترابط الأفقي وسلاسل التعلم", text: vision.horizontal_bundling },
    { label: "التكامل بين الأهداف والمجالات", text: vision.cross_domain_integration },
    { label: "التسلسل المنطقي لمسار التدريب", text: vision.sequential_logic },
    { label: "رصد الأهداف المشتتة", text: vision.scattered_goals },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">الطالب</p>
          <p className="font-bold">{s.student_name}</p>
          <p className="text-xs text-muted-foreground">
            العمر: {s.age ?? "غير محدد"} — {s.disability_type}
          </p>
          <p className="text-xs text-muted-foreground">المركز/المدرسة: {s.school_center || "غير محدد"}</p>
          {fileInfo && <p className="text-xs text-muted-foreground">الملف: {fileInfo.name}</p>}
        </div>
        <div className={`flex items-center ${report.audit_scope === "level2" ? "hidden" : ""}`}>
          <ScoreRing percent={l1.compliance_percent} label="نسبة الاتساق" sub={`النتيجة: ${l1.total_score} من 19`} />
        </div>
        <div className={`space-y-1 ${report.audit_scope === "level2" ? "hidden" : ""}`}>
          <p className="text-xs text-muted-foreground">قرار الاعتماد الرقمي</p>
          <p className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold ${decisionOk ? "bg-primary/10 text-primary" : decisionMid ? "bg-accent text-accent-foreground" : "bg-destructive/10 text-destructive"}`}>
            {decisionOk ? <CheckCircle2 className="h-4 w-4" /> : <Award className="h-4 w-4" />}
            {l1.accreditation_decision}
          </p>
        </div>
        <div className={`space-y-1 ${report.audit_scope === "level1" ? "hidden" : ""}`}>
          <p className="text-xs text-muted-foreground">تغطية الاحتياجات</p>
          <p className="font-bold">{coverage.all_covered ? "جميع الاحتياجات مغطاة" : `${coverage.uncovered_needs.length} احتياج غير مغطى`}</p>
          <p className="text-xs text-muted-foreground">{report.revisions.length} هدفاً معدلاً في جدول التتبع</p>
        </div>
      </div>

      <Section title="المستوى الأول — التقييم الرقمي لمعايير الجودة (19 بنداً فعّالاً)" hidden={!reportSections.standards}>
        <div className="grid gap-3 sm:grid-cols-2">
          {PILLAR_LABELS.map(({ key, label }, i) => {
            const pillar = l1[key];
            return (
              <div key={key} className="space-y-2 rounded-xl border border-border p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">
                    {i + 1}. {label}
                  </p>
                  <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold tabular-nums text-primary">
                    {pillar.score} / {pillar.max_score} — {pillar.percent}%
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (pillar.score / PILLAR_MAX_SCORES[key]) * 100)}%` }} />
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">{pillar.comment}</p>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="المستوى الثاني — الجزء أ: الرؤية العامة للخطة" hidden={!reportSections.overview}>
        <div className="grid gap-3 sm:grid-cols-2">
          {visionItems.map((v, i) => (
            <div key={v.label} className="rounded-xl border border-border p-4">
              <p className="mb-1 text-sm font-semibold">
                {i + 1}. {v.label}
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">{v.text}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="المستوى الثاني — الجزء ب: مصفوفة تغطية نقاط الاحتياج" hidden={!reportSections.mapping}>
        {coverage.all_covered ? (
          <p className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm font-medium text-primary">
            <CheckCircle2 className="h-4 w-4" /> جميع احتياجات مستوى الأداء الحالي مغطاة بأهداف صريحة.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">الاحتياجات التالية وردت في مستوى الأداء الحالي ولم يقابلها هدف صريح — مع هدف مقترح لكل منها:</p>
            {coverage.uncovered_needs.map((n, i) => (
              <div key={i} className="space-y-2 rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-destructive/10 px-2 py-0.5 text-xs font-bold text-destructive">غير مغطى</span>
                  <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">{n.domain}</span>
                </div>
                <p className="text-sm leading-relaxed">{n.need}</p>
                <p className="rounded-lg bg-primary/5 p-3 text-sm leading-relaxed">
                  <span className="font-semibold text-primary">الهدف المقترح: </span>
                  {n.suggested_goal}
                </p>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title={`جدول تتبع التعديلات المباشرة (${report.revisions.length})`} hidden={!reportSections.revisions}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-right">
                {["المجال", "الهدف الأصلي", "الهدف بعد التعديل", "تصنيف التعديل", "سبب التعديل والقاعدة الفنية"].map((h) => (
                  <th key={h} className="p-2 text-xs font-semibold text-muted-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.revisions.map((r, i) => (
                <tr key={i} className="border-b border-border/60 align-top">
                  <td className="p-2 text-xs font-medium">{r.domain}</td>
                  <td className="max-w-52 p-2 text-xs leading-relaxed text-muted-foreground">{r.original_goal}</td>
                  <td className="max-w-52 p-2 text-xs leading-relaxed">{r.revised_goal}</td>
                  <td className="p-2">
                    <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{r.revision_category}</span>
                  </td>
                  <td className="max-w-64 p-2 text-xs leading-relaxed text-muted-foreground">
                    {r.rationale}
                    {r.standards_violated.length > 0 && <span className="mt-1 block text-[11px]">المعايير: {r.standards_violated.join("، ")}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="التصنيف الثلاثي لتعديلات الأهداف" hidden={!reportSections.categories}>
        <div className="grid gap-3 lg:grid-cols-3">
          {REVISION_CATEGORIES.map((category) => {
            const items = report.revisions.filter((r) => r.revision_category === category);
            return (
              <div key={category} className="space-y-2 rounded-xl border border-border p-4">
                <p className="flex items-center justify-between text-sm font-semibold">
                  {category}
                  <span className="rounded-md bg-muted px-2 py-0.5 text-xs tabular-nums">{items.length}</span>
                </p>
                {items.length === 0 ? (
                  <p className="text-xs text-muted-foreground">لا توجد أمثلة تحت هذا التصنيف.</p>
                ) : (
                  items.map((r, i) => (
                    <p key={i} className="rounded-lg bg-muted/50 p-2 text-xs leading-relaxed">
                      {r.revised_goal}
                    </p>
                  ))
                )}
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="التوصيات الإشرافية النهائية وتوجيهات الاعتماد" hidden={!reportSections.recommendations}>
        <ol className="space-y-2">
          {report.recommendations.map((t, i) => (
            <li key={i} className="flex items-start gap-2 text-sm leading-relaxed">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{i + 1}</span>
              {t}
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}
