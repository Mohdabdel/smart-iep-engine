import { authHeaders } from "@/lib/auth-header";
import { supabase } from "@/integrations/supabase/client";
import { SignOutButton } from "@/components/SignOutButton";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ChevronDown,
  RotateCw,
  XCircle,
  Download,
  FileJson,
  FileText,
  ListChecks,
  Loader2,
  Pencil,
  Play,
  Printer,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
} from "lucide-react";
import { extractTextFromFile } from "@/lib/parse-document";
import {
  CRITERIA_REGISTRY,
  CRITERION_STATES,
  CRITERION_STATE_LABELS,
  EVIDENCE_SOURCES,
  REVIEW_TYPES,
  SOURCE_STATES,
  SOURCE_STATE_LABELS,
  TRANSITION_APPLICABILITY,
  TRANSITION_APPLICABILITY_LABELS,
  defaultReviewConfig,
  pillarsForReviewType,
  type CriterionState,
  type EvidenceSourceId,
  type ReviewConfig,
} from "@/lib/criteria-registry";
import { FINDING_STATUSES, TRANSITION_CONCEPTS, normalizeReport, partsForReviewType, toReport, type IepAuditReport, type ModelKey, type ModelOutput } from "@/lib/iep-schema";
import { applyReviewerParity, statusCounts, type ParityStats } from "@/lib/iep-parity";
import { RetriableError, caseStatusFor, initialParts, mergeParts, runParts, type PartContext, type PartState } from "@/lib/review-orchestrator";
import {
  PART_STATUS_LABELS,
  cacheCaseDocuments,
  cachedCaseDocuments,
  createReviewCase,
  dropCaseDocuments,
  loadReviewCase,
  saveEditedReport,
  saveReviewPart,
  updateReviewCase,
} from "@/lib/review-store";
import {
  DEFAULT_REPORT_SECTIONS,
  REPORT_SECTION_OPTIONS,
  buildReportBlocks,
  exportDocx,
  exportJson,
  exportPdf,
  type ReportSections,
} from "@/lib/export-report";
import { ReportEditor } from "@/components/ReportEditor";

export const Route = createFileRoute("/_authenticated/_admin/")({
  component: Home,
  head: () => ({
    meta: [
      { title: "محرك المراجعة الإشرافية الأولية للخطط التربوية الفردية" },
      { name: "description", content: "مراجعة إشرافية أولية لجودة الخطط التربوية الفردية: معايير قابلة للتهيئة، بوابات حرجة، تغطية الاحتياجات، الرؤية الكلية، مفاهيم الانتقال، وتصدير PDF/Word/JSON." },
      { property: "og:title", content: "محرك المراجعة الإشرافية الأولية للخطط التربوية الفردية" },
      { property: "og:description", content: "مراجعة أولية قريبة من أسلوب المشرف، يراجعها المشرف ويعدلها ويعتمدها ثم يصدرها." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type ParsedDocument = { source: string; name: string; text: string };
type AuditResult = { report: IepAuditReport; parity?: ParityStats; partial?: string[] | undefined };
type Stage = "idle" | "configuring" | "parsing" | "auditing";
type FileInfo = { name: string; textLength: number };

const SAVED_REPORT_KEY = "iep-audit:last-report";
type SavedReport = { result: AuditResult; fileInfo: FileInfo | null; reportSections: ReportSections; caseId?: string | null };

/** يبني التقرير من الأجزاء المكتملة ويطبق قواعد المراجع مرة واحدة */
function buildFromParts(parts: PartState[], config: ReviewConfig): AuditResult | null {
  if (!parts.some((p) => p.status === "completed")) return null;
  const parity = applyReviewerParity(toReport(mergeParts(parts), config), config);
  const missing = parts.filter((p) => p.status !== "completed").map((p) => p.label);
  return { report: parity.report, parity: parity.stats, partial: missing.length ? missing : undefined };
}

async function runAuditPart(config: ReviewConfig, documents: ParsedDocument[], keys: ModelKey[], context: PartContext = {}): Promise<Partial<ModelOutput>> {
  const response = await fetch("/api/audit", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ config, documents, keys, context }),
  });
  if (!response.ok || !response.body) {
    const j = (await response.json().catch(() => null)) as { error?: string } | null;
    const msg = j?.error ?? "تعذر الاتصال بمحرك التدقيق.";
    throw response.status >= 500 || response.status === 0 ? new RetriableError(msg) : new Error(msg);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await reader.read();
    } catch {
      throw new RetriableError("انقطع الاتصال بالخادم أثناء تنفيذ هذا الجزء.");
    }
    const { done, value } = chunk;
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const message = JSON.parse(line) as
        | { type: "result"; data: { partial: Partial<ModelOutput> } }
        | { type: "error"; message?: string }
        | { type: "ping" };
      if (message.type === "error") throw new Error(message.message ?? "فشل التدقيق.");
      if (message.type === "result") return message.data.partial;
    }
  }
  throw new RetriableError("انقطع الاتصال قبل وصول نتيجة هذا الجزء.");
}

function Home() {
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [planFile, setPlanFile] = useState<File | null>(null);
  const [extraFiles, setExtraFiles] = useState<Partial<Record<EvidenceSourceId, File>>>({});
  const [config, setConfig] = useState<ReviewConfig>(defaultReviewConfig);
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [restored, setRestored] = useState(false);
  const [reportSections, setReportSections] = useState<ReportSections>(DEFAULT_REPORT_SECTIONS);
  const [selectingSections, setSelectingSections] = useState(false);
  const [editing, setEditing] = useState(false);
  const [exporting, setExporting] = useState<null | "docx" | "json">(null);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  const [caseId, setCaseId] = useState<string | null>(null);
  const [parts, setParts] = useState<PartState[]>([]);
  const [docs, setDocs] = useState<ParsedDocument[] | null>(null);
  const [runConfig, setRunConfig] = useState<ReviewConfig | null>(null);
  const [cloudWarning, setCloudWarning] = useState<string | null>(null);
  const [caseStatus, setCaseStatus] = useState<string | null>(null);

  const submissionRef = useRef<string | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const subId = q.get("submission");
    if (subId) {
      window.history.replaceState(null, "", "/");
      void (async () => {
        const { data: sub } = await supabase.from("submissions").select("*").eq("id", subId).maybeSingle();
        if (!sub) return setError("تعذر العثور على المستند.");
        const { data: blob } = await supabase.storage.from("submissions").download(sub.file_path);
        if (!blob) return setError("تعذر تنزيل المستند.");
        await supabase.from("submissions").update({ status: "in_review" }).eq("id", subId);
        chooseFile(new File([blob], sub.file_name, { type: blob.type }));
        submissionRef.current = subId;
      })();
      return;
    }
    const openId = q.get("case");
    const copyId = q.get("copy");
    if (openId || copyId) {
      window.history.replaceState(null, "", "/");
      void openCase((openId ?? copyId)!, { copy: !!copyId, edit: q.get("edit") === "1" });
      return;
    }
    try {
      const raw = localStorage.getItem(SAVED_REPORT_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as SavedReport;
      if (saved.result?.report?.schema_version !== 4) return;
      setResult({ ...saved.result, report: normalizeReport(saved.result.report) });
      setFileInfo(saved.fileInfo ?? null);
      setReportSections({ ...DEFAULT_REPORT_SECTIONS, ...(saved.reportSections ?? {}) });
      setCaseId(saved.caseId ?? null);
      setRestored(true);
      // السجل الدائم هو المصدر الرئيسي؛ النسخة المحلية احتياط سريع
      if (saved.caseId) void openCase(saved.caseId, { silent: true });
    } catch {
      /* corrupted entry — ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** فتح مراجعة من الأرشيف: التقرير، الأقسام، وحالة الأجزاء */
  async function openCase(id: string, opts: { copy?: boolean; edit?: boolean; silent?: boolean } = {}) {
    setError(null);
    try {
      const { case: c, parts: stored } = await loadReviewCase(id);
      const cfg = { ...defaultReviewConfig(), ...c.review_config };
      if (opts.copy) {
        setConfig(cfg);
        setCloudWarning("تم نسخ إعدادات المراجعة السابقة — اختر ملف الخطة لبدء مراجعة جديدة بنفس الإعدادات.");
        return;
      }
      const ps = initialParts(partsForReviewType(cfg.review_type)).map((p) => {
        const s = stored.find((x) => x.part_key === p.key);
        return s ? { ...p, status: s.status === "running" ? ("failed" as const) : s.status, attempts: s.attempts, error: s.status === "running" ? "توقف التنفيذ قبل اكتماله." : (s.error_message ?? undefined), result: (s.result_json ?? undefined) as PartState["result"] } : p;
      });
      setCaseId(id);
      setCaseStatus(c.status);
      setRunConfig(cfg);
      setConfig(cfg);
      setParts(ps);
      setDocs(null);
      setFileInfo({ name: c.source_file_name, textLength: 0 });
      setReportSections({ ...DEFAULT_REPORT_SECTIONS, ...(c.report_sections ?? {}) });
      const built = c.report_json ? { report: normalizeReport(c.report_json), partial: buildFromParts(ps, cfg)?.partial } : buildFromParts(ps, cfg);
      setResult(built);
      setStage("idle");
      if (opts.edit && built) setEditing(true);
    } catch (e) {
      if (opts.silent) return;
      setError(e instanceof Error ? `تعذر فتح المراجعة: ${e.message}` : "تعذر فتح المراجعة.");
    }
  }

  useEffect(() => {
    if (!result) return;
    try {
      localStorage.setItem(SAVED_REPORT_KEY, JSON.stringify({ result, fileInfo, reportSections, caseId }));
    } catch {
      /* quota exceeded — ignore */
    }
  }, [result, fileInfo, reportSections, caseId]);

  // حفظ اختيارات الأقسام في السجل الدائم
  const sectionsLoaded = useRef(false);
  useEffect(() => {
    if (!caseId || !result) return;
    if (!sectionsLoaded.current) {
      sectionsLoaded.current = true;
      return;
    }
    const t = setTimeout(() => void updateReviewCase(caseId, { report_sections: reportSections }).catch(() => undefined), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportSections]);

  /** تشغيل/استكمال الأجزاء ثم بناء التقرير (كاملاً أو جزئياً) وحفظه */
  async function execute(cfg: ReviewConfig, documents: ParsedDocument[], start: PartState[], id: string | null, only?: string[]) {
    setStage("auditing");
    setParts(start);
    const final = await runParts({
      parts: start,
      only,
      run: (keys, context) => runAuditPart(cfg, documents, keys, context),
      store: id ? { save: (key, status, extra) => saveReviewPart(id, key, status, extra) } : null,
      onUpdate: (ps) => {
        setParts(ps);
        setProgress({ done: ps.filter((p) => p.status === "completed").length, total: ps.length });
      },
    });
    const status = caseStatusFor(final);
    setCaseStatus(status);
    const built = buildFromParts(final, cfg);
    setResult(built);
    if (status === "completed" && id) dropCaseDocuments(id);
    if (id) {
      await updateReviewCase(id, {
        status,
        ...(built ? { report_json: built.report, review_decision: built.report.review_decision, learner_name: built.report.student_info.student_name || null } : {}),
      }).catch(() => setCloudWarning("تعذر تحديث السجل السحابي — التقرير محفوظ محلياً على هذا الجهاز."));
    }
    setStage(built ? "idle" : "configuring");
    if (!built) setError("تعذر تنفيذ جميع أجزاء المراجعة. يمكنك استكمال المراجعة دون إعادة ما اكتمل.");
  }

  async function resume(only?: string[]) {
    if (!runConfig) return;
    const d = docs ?? (caseId ? cachedCaseDocuments(caseId) : null);
    if (!d) {
      setError("نص الخطة غير متوفر على هذا الجهاز لاستكمال المراجعة — ابدأ مراجعة جديدة بنفس الملف.");
      return;
    }
    setError(null);
    setDocs(d);
    await execute(runConfig, d, parts, caseId, only);
  }

  function chooseFile(file: File) {
    setError(null);
    setCaseId(null);
    setParts([]);
    setCaseStatus(null);
    setResult(null);
    setRestored(false);
    setEditing(false);
    try {
      localStorage.removeItem(SAVED_REPORT_KEY);
    } catch {
      /* ignore */
    }
    setPlanFile(file);
    setStage("configuring");
  }

  async function startAudit() {
    if (!planFile) return;
    setError(null);
    setStage("parsing");
    try {
      const docs: ParsedDocument[] = [{ source: "current_plan", name: planFile.name, text: await extractTextFromFile(planFile) }];
      for (const [source, f] of Object.entries(extraFiles)) {
        if (f && config.sources[source as EvidenceSourceId] === "attached") docs.push({ source, name: f.name, text: await extractTextFromFile(f) });
      }
      // مصدر مُعلَّم «مرفق» بلا ملف = غير متوفر فعلياً
      const effective: ReviewConfig = {
        ...config,
        sources: Object.fromEntries(
          Object.entries(config.sources).map(([k, v]) => [k, v === "attached" && !docs.some((d) => d.source === k) ? "unavailable" : v]),
        ) as ReviewConfig["sources"],
      };
      setFileInfo({ name: planFile.name, textLength: docs[0]!.text.length });
      setReportSections(DEFAULT_REPORT_SECTIONS);
      const start = initialParts(partsForReviewType(effective.review_type));
      let id: string | null = null;
      try {
        id = await createReviewCase({
          source_file_name: planFile.name,
          review_type: effective.review_type,
          review_config: effective,
          report_sections: DEFAULT_REPORT_SECTIONS,
          part_keys: start.map((p) => p.key),
        });
        cacheCaseDocuments(id, docs);
        setCloudWarning(null);
      } catch {
        setCloudWarning("الحفظ السحابي غير متاح لهذه الجلسة — يُحفظ التقرير محلياً على هذا الجهاز فقط.");
      }
      sectionsLoaded.current = false;
      setCaseId(id);
      if (submissionRef.current) {
        void supabase.from("submissions").update({ review_case_id: id }).eq("id", submissionRef.current);
        submissionRef.current = null;
      }
      setDocs(docs);
      setRunConfig(effective);
      await execute(effective, docs, start, id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ غير متوقع.");
      setStage("configuring");
    }
  }

  function reset() {
    setCaseId(null);
    setParts([]);
    setDocs(null);
    setCaseStatus(null);
    setResult(null);
    setFileInfo(null);
    setError(null);
    setRestored(false);
    setSelectingSections(false);
    setEditing(false);
    setPlanFile(null);
    setExtraFiles({});
    setConfig(defaultReviewConfig());
    setStage("idle");
    setReportSections(DEFAULT_REPORT_SECTIONS);
    try {
      localStorage.removeItem(SAVED_REPORT_KEY);
    } catch {
      /* ignore */
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  const busy = stage === "parsing" || stage === "auditing";
  const btn = "inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-2 text-sm hover:bg-accent disabled:opacity-50";

  return (
    <main dir="rtl" className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/60 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-lg font-bold leading-tight">محرك المراجعة الإشرافية الأولية للخطط التربوية الفردية</h1>
              <p className="text-xs text-muted-foreground">مراجعة أولية وفق مصفوفة الجودة — يراجعها المشرف ويعدلها ويعتمدها</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/reviews" className={btn}>
              <Archive className="h-4 w-4" /> المراجعات السابقة
            </Link>
            <Link to="/admin/submissions" className={btn}>المستندات الواردة</Link>
            <Link to="/admin/users" className={btn}>المستخدمون</Link>
            <SignOutButton className={btn} />
          </div>
          {result && (
            <div className="flex flex-wrap items-center gap-2">
              {caseId && !result.partial && (
                <button
                  disabled={caseStatus === "approved"}
                  onClick={() =>
                    void updateReviewCase(caseId, { status: "approved", report_json: result.report, review_decision: result.report.review_decision })
                      .then(() => setCaseStatus("approved"))
                      .catch(() => setCloudWarning("تعذر تسجيل الاعتماد سحابياً."))
                  }
                  className={btn}
                >
                  <CheckCircle2 className="h-4 w-4" /> {caseStatus === "approved" ? "معتمد" : "اعتماد التقرير"}
                </button>
              )}
              <button onClick={() => setEditing(true)} className={btn}>
                <Pencil className="h-4 w-4" /> تعديل التقرير
              </button>
              <button
                onClick={() => setSelectingSections((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm ${selectingSections ? "border-primary bg-primary/10 text-primary" : "border-input hover:bg-accent"}`}
              >
                <ListChecks className="h-4 w-4" /> تحديد مكونات التقرير
              </button>
              <button onClick={() => exportPdf()} className={btn}>
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
                className={btn}
              >
                {exporting === "docx" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Word
              </button>
              <button onClick={() => exportJson(result, result.report, reportSections)} className={btn}>
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
        {!result && stage === "idle" && (
          <section className="mx-auto max-w-2xl space-y-6">
            <div className="space-y-2 text-center">
              <h2 className="text-2xl font-bold">ارفع الخطة التربوية الفردية</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                بعد اختيار الملف تُهيّئ نطاق المراجعة ومصادر الأدلة والمعايير، ثم ينفّذ المحرك مراجعة إشرافية أولية تراجعها وتعدلها قبل الاعتماد.
              </p>
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
                if (f) chooseFile(f);
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
                  if (f) chooseFile(f);
                }}
              />
              <div className="space-y-3">
                <FileText className="mx-auto h-10 w-10 text-muted-foreground" />
                <p className="font-medium">اسحب الملف هنا أو اختره من جهازك</p>
                <p className="text-xs text-muted-foreground">PDF أو Word (DOCX) أو نص (TXT)</p>
                <button onClick={() => inputRef.current?.click()} className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90">
                  اختيار ملف
                </button>
              </div>
            </div>
          </section>
        )}

        {!result && stage !== "idle" && planFile && (
          <ScopeConfigurator
            planFile={planFile}
            config={config}
            setConfig={setConfig}
            extraFiles={extraFiles}
            setExtraFiles={setExtraFiles}
            busy={busy}
            stage={stage}
            progress={progress}
            error={error}
            onStart={startAudit}
            onCancel={reset}
          />
        )}

        {cloudWarning && (
          <div className="mb-4 rounded-xl border border-border bg-muted/50 p-3 text-center text-xs text-muted-foreground print:hidden">{cloudWarning}</div>
        )}
        {parts.length > 0 && (stage === "auditing" || parts.some((p) => p.status !== "completed")) && (
          <PartsPanel parts={parts} busy={busy} onResume={() => void resume()} onRetry={(k) => void resume([k])} />
        )}
        {!result && stage === "idle" && parts.length > 0 && error && (
          <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        {result && (
          <div className="space-y-6">
            {result.partial && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-center text-sm font-semibold text-destructive">
                تقرير جزئي — بعض أقسام المراجعة لم تكتمل: {result.partial.join("، ")}
              </div>
            )}
            {restored && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-center text-xs text-muted-foreground print:hidden">
                تمت استعادة آخر تقرير محفوظ تلقائياً — اضغط «مستند جديد» لبدء مراجعة جديدة.
              </div>
            )}
            {selectingSections && (
              <div className="rounded-xl border border-primary/40 bg-primary/5 p-4 print:hidden">
                <p className="mb-3 text-sm font-semibold">حدد الأقسام التي تريد تضمينها في الطباعة والتصدير (مستقل عن نطاق المراجعة):</p>
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
            <AuditReportView report={result.report} fileInfo={fileInfo} reportSections={reportSections} />
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
            if (caseId) void saveEditedReport(caseId, r).catch(() => setCloudWarning("تعذر حفظ التعديلات سحابياً — محفوظة محلياً على هذا الجهاز."));
          }}
        />
      )}
    </main>
  );
}

function ScopeConfigurator(props: {
  planFile: File;
  config: ReviewConfig;
  setConfig: (c: ReviewConfig) => void;
  extraFiles: Partial<Record<EvidenceSourceId, File>>;
  setExtraFiles: (f: Partial<Record<EvidenceSourceId, File>>) => void;
  busy: boolean;
  stage: Stage;
  progress: { done: number; total: number };
  error: string | null;
  onStart: () => void;
  onCancel: () => void;
}) {
  const { config, setConfig, extraFiles, setExtraFiles, busy } = props;
  const [open, setOpen] = useState<string | null>(null);
  const pillars = new Set(pillarsForReviewType(config.review_type));
  const setCriterion = (id: string, state: CriterionState, reason?: string) =>
    setConfig({ ...config, criteria: { ...config.criteria, [id]: { state, reason: state === "active" ? undefined : (reason ?? config.criteria[id]?.reason) } } });
  const setPillar = (pid: string, state: CriterionState) => {
    const p = CRITERIA_REGISTRY.find((x) => x.id === pid)!;
    setConfig({ ...config, criteria: { ...config.criteria, ...Object.fromEntries(p.criteria.map((c) => [c.id, { state, reason: state === "active" ? undefined : config.criteria[c.id]?.reason }])) } });
  };
  const needsPrevious = config.review_type === "compare_previous" && !(config.sources.previous_plan === "attached" && extraFiles.previous_plan);

  return (
    <section className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <SlidersHorizontal className="h-5 w-5 text-primary" /> تهيئة نطاق المراجعة ومصادر الأدلة
          </h2>
          <p className="text-xs text-muted-foreground">الملف: {props.planFile.name}</p>
        </div>
        <button onClick={props.onCancel} disabled={busy} className="rounded-lg border border-input px-3 py-2 text-sm hover:bg-accent disabled:opacity-50">
          إلغاء واختيار ملف آخر
        </button>
      </div>

      <div className="space-y-2 rounded-2xl border border-border bg-card p-5">
        <h3 className="font-semibold">1. نوع المراجعة</h3>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {REVIEW_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={busy}
              onClick={() =>
                setConfig({
                  ...config,
                  review_type: t.id,
                  ...(t.id === "compare_previous" ? { sources: { ...config.sources, previous_plan: "attached" } } : {}),
                })
              }
              className={`rounded-xl border p-3 text-right text-sm font-medium transition-colors ${config.review_type === t.id ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-muted"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <h3 className="font-semibold">2. مصادر المعلومات المتاحة</h3>
        <div className="divide-y divide-border">
          {EVIDENCE_SOURCES.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-2 py-2">
              <span className="w-32 text-sm font-medium">{s.label}</span>
              {s.id === "current_plan" ? (
                <span className="text-xs text-muted-foreground">مرفق — الملف الرئيسي</span>
              ) : (
                <>
                  <select
                    disabled={busy}
                    className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs"
                    value={config.sources[s.id]}
                    onChange={(e) => setConfig({ ...config, sources: { ...config.sources, [s.id]: e.target.value as (typeof SOURCE_STATES)[number] } })}
                  >
                    {SOURCE_STATES.map((st) => (
                      <option key={st} value={st}>
                        {SOURCE_STATE_LABELS[st]}
                      </option>
                    ))}
                  </select>
                  {config.sources[s.id] === "attached" && (
                    <label className="cursor-pointer rounded-lg border border-dashed border-input px-2 py-1.5 text-xs hover:bg-muted">
                      {extraFiles[s.id]?.name ?? "إرفاق ملف"}
                      <input
                        type="file"
                        accept=".pdf,.docx,.txt"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) setExtraFiles({ ...extraFiles, [s.id]: f });
                        }}
                      />
                    </label>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">المصدر المتحقق خارج النظام يُسجَّل «متحقق خارج الوثيقة الحالية بتأكيد المراجع» ولا يُعاقب عليه. المصدر «المرفق» بلا ملف يُعامل كغير متوفر.</p>
      </div>

      <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <h3 className="font-semibold">3. البنود والمعايير الداخلة في المراجعة</h3>
        {CRITERIA_REGISTRY.map((p) => {
          const inType = pillars.has(p.id);
          const activeCount = p.criteria.filter((c) => config.criteria[c.id]?.state === "active").length;
          return (
            <div key={p.id} className={`rounded-xl border border-border ${inType ? "" : "opacity-50"}`}>
              <div className="flex flex-wrap items-center gap-2 p-3">
                <button onClick={() => setOpen(open === p.id ? null : p.id)} className="flex flex-1 items-center gap-2 text-right text-sm font-semibold">
                  <ChevronDown className={`h-4 w-4 transition-transform ${open === p.id ? "rotate-180" : ""}`} />
                  {p.label}
                  <span className="text-xs font-normal text-muted-foreground">
                    ({activeCount} مفعّل من {p.criteria.length}){inType ? "" : " — خارج نوع المراجعة"}
                  </span>
                </button>
                {CRITERION_STATES.map((st) => (
                  <button key={st} disabled={busy} onClick={() => setPillar(p.id, st)} className="rounded-md border border-input px-2 py-1 text-xs hover:bg-muted">
                    {st === "active" ? "تشغيل المحور" : st === "frozen" ? "تجميد المحور" : "لا ينطبق"}
                  </button>
                ))}
              </div>
              {open === p.id && (
                <div className="divide-y divide-border border-t border-border">
                  {p.criteria.map((c) => {
                    const cur = config.criteria[c.id] ?? { state: "active" as const };
                    return (
                      <div key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                        <span className="w-12 text-xs tabular-nums text-muted-foreground">{c.id}</span>
                        <span className="min-w-40 flex-1 text-sm">{c.label}</span>
                        <div className="flex overflow-hidden rounded-lg border border-input">
                          {CRITERION_STATES.map((st) => (
                            <button
                              key={st}
                              disabled={busy}
                              onClick={() => setCriterion(c.id, st)}
                              className={`px-2 py-1 text-xs ${cur.state === st ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                            >
                              {CRITERION_STATE_LABELS[st]}
                            </button>
                          ))}
                        </div>
                        {cur.state !== "active" && (
                          <input
                            placeholder="سبب التجميد (اختياري)"
                            className="w-full rounded-lg border border-input bg-background px-2 py-1 text-xs sm:w-64"
                            value={cur.reason ?? ""}
                            onChange={(e) => setCriterion(c.id, cur.state, e.target.value)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <h3 className="font-semibold">4. انطباق مفاهيم الانتقال (اختياري)</h3>
        <p className="text-xs text-muted-foreground">
          إن حددت الانطباق تُحسب نسبة التغطية على المفاهيم المنطبقة فقط؛ وإن تُركت كلها «غير محدد» تُعرض نسبة وصفية على جميع المفاهيم. النسبة ليست قرار اعتماد.
        </p>
        <div className="divide-y divide-border rounded-xl border border-border">
          {TRANSITION_CONCEPTS.map((c) => {
            const cur = config.transition_applicability?.[c] ?? "unset";
            return (
              <div key={c} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="min-w-40 flex-1 text-sm">{c}</span>
                <div className="flex overflow-hidden rounded-lg border border-input">
                  {TRANSITION_APPLICABILITY.map((st) => (
                    <button
                      key={st}
                      disabled={busy}
                      onClick={() => setConfig({ ...config, transition_applicability: { ...(config.transition_applicability ?? {}), [c]: st } })}
                      className={`px-2 py-1 text-xs ${cur === st ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                    >
                      {TRANSITION_APPLICABILITY_LABELS[st]}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {props.error && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {props.error}
        </div>
      )}
      {needsPrevious && <p className="text-xs text-destructive">المقارنة مع خطة سابقة تتطلب إرفاق ملف الخطة السابقة.</p>}

      <div className="flex items-center justify-end gap-3">
        {busy && (
          <p className="text-xs text-muted-foreground">{props.stage === "parsing" ? "جارٍ قراءة المستندات…" : `جارٍ تنفيذ المراجعة على ${props.progress.total} أجزاء متوازية — اكتمل ${props.progress.done} — لا تغلق الصفحة.`}</p>
        )}
        <button
          onClick={props.onStart}
          disabled={busy || needsPrevious}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} بدء المراجعة
        </button>
      </div>
    </section>
  );
}

function AuditReportView({ report, fileInfo, reportSections }: { report: IepAuditReport; fileInfo: FileInfo | null; reportSections: ReportSections }) {
  const s = report.student_info;
  const counts = statusCounts(report);
  const blocks = buildReportBlocks(report, reportSections);
  const decisionTone =
    report.review_decision === "جاهزة للاعتماد"
      ? "bg-primary/10 text-primary"
      : report.review_decision === "جاهزة بعد تعديلات محدودة"
        ? "bg-accent text-accent-foreground"
        : "bg-destructive/10 text-destructive";

  return (
    <div className="space-y-6">
      <div className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">الطالب</p>
          <p className="font-bold">{s.student_name || "غير محدد"}</p>
          <p className="text-xs text-muted-foreground">
            العمر: {s.age ?? "غير محدد"} — {s.disability_type || "—"}
          </p>
          {fileInfo && <p className="text-xs text-muted-foreground">الملف: {fileInfo.name}</p>}
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">قرار المراجعة</p>
          <p className={`inline-flex rounded-lg px-3 py-1.5 text-sm font-bold ${decisionTone}`}>{report.review_decision}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">البوابات الحرجة</p>
          <p className="font-bold">{report.critical_gates.length ? `${report.critical_gates.length} بوابة مفعّلة` : "لا توجد"}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">حالات المعايير (للعرض فقط)</p>
          {FINDING_STATUSES.filter((st) => counts[st]).map((st) => (
            <p key={st} className="text-xs">
              {st}: <span className="font-bold tabular-nums">{counts[st]}</span>
            </p>
          ))}
          {!report.criteria_results.length && <p className="text-xs text-muted-foreground">لم تُقيَّم معايير في هذا النطاق</p>}
        </div>
      </div>

      {blocks.map((b) => (
        <section key={b.id} className="space-y-3 rounded-2xl border border-border bg-card p-5 print:break-inside-avoid">
          <h2 className="text-base font-bold">{b.title}</h2>
          {b.lines.filter((l) => l.trim()).map((l, i) => (
            <p key={i} className="text-sm leading-relaxed">
              {l}
            </p>
          ))}
          {b.table && b.table.rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-muted/60">
                    {b.table.head.map((h) => (
                      <th key={h} className="border border-border px-2 py-1.5 text-right text-xs font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.table.rows.map((r, i) => (
                    <tr key={i} className="align-top">
                      {r.map((c, j) => (
                        <td key={j} className="border border-border px-2 py-1.5 text-xs leading-relaxed">
                          {c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function PartsPanel({ parts, busy, onResume, onRetry }: { parts: PartState[]; busy: boolean; onResume: () => void; onRetry: (key: string) => void }) {
  const done = parts.filter((p) => p.status === "completed").length;
  const incomplete = parts.some((p) => p.status === "failed" || p.status === "pending");
  return (
    <section className="mx-auto mb-6 max-w-4xl space-y-3 rounded-2xl border border-border bg-card p-5 print:hidden">
      <h3 className="font-semibold">أجزاء المراجعة</h3>
      <ul className="space-y-2">
        {parts.map((p) => (
          <li key={p.key} className="flex flex-wrap items-center gap-2 text-sm">
            {p.status === "completed" ? (
              <CheckCircle2 className="h-4 w-4 text-primary" />
            ) : p.status === "failed" ? (
              <XCircle className="h-4 w-4 text-destructive" />
            ) : p.status === "running" ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <span className="h-4 w-4 rounded-full border border-border" />
            )}
            <span className="font-medium">{p.label}</span>
            <span className="text-xs text-muted-foreground">— {PART_STATUS_LABELS[p.status]}{p.attempts > 1 ? ` (محاولات: ${p.attempts})` : ""}</span>
            {p.status === "failed" && p.error && <span className="text-xs text-destructive">{p.error}</span>}
            {p.status === "failed" && !busy && (
              <button onClick={() => onRetry(p.key)} className="mr-auto inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-muted">
                <RotateCw className="h-3 w-3" /> إعادة هذا الجزء
              </button>
            )}
          </li>
        ))}
      </ul>
      {!busy && incomplete && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <p className="text-sm">
            اكتملت {done} من {parts.length} أجزاء. يمكنك استكمال الجزء المتوقف دون إعادة الأجزاء المكتملة.
          </p>
          <button onClick={onResume} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
            <RotateCw className="h-4 w-4" /> استكمال المراجعة
          </button>
        </div>
      )}
    </section>
  );
}
