import { describe, expect, it, vi } from "vitest";

import { defaultReviewConfig } from "@/lib/criteria-registry";
import { partsForReviewType, toReport, emptyModelOutput } from "@/lib/iep-schema";
import { applyReviewerParity } from "@/lib/iep-parity";
import { DEFAULT_REPORT_SECTIONS, REPORT_SECTION_OPTIONS, buildReportBlocks, selectJson } from "@/lib/export-report";
import { RetriableError, caseStatusFor, initialParts, mergeParts, runParts, type PartState } from "@/lib/review-orchestrator";

const buckets = partsForReviewType("full");
const fake = (keys: string[]) => Object.fromEntries(keys.map((k) => [k, (emptyModelOutput() as Record<string, unknown>)[k]]));

function setup(failKey?: string, retriable = false) {
  const calls: string[] = [];
  const saved: { key: string; status: string }[] = [];
  const run = vi.fn(async (keys: string[]) => {
    calls.push(keys.join("+"));
    if (keys.join("+") === failKey) throw retriable ? new RetriableError("net") : new Error("logic");
    return fake(keys);
  });
  const store = { save: async (key: string, status: string) => void saved.push({ key, status }) };
  return { calls, saved, run, store };
}

describe("resumable orchestration", () => {
  it("has 9 parts for a full review (inventory + 7 analytic + synthesis)", () => expect(buckets).toHaveLength(9));

  it("TEST-R1: one failing part leaves 3 completed and case partial", async () => {
    const fk = initialParts(buckets)[2]!.key;
    const s = setup(fk);
    const out = await runParts({ parts: initialParts(buckets), run: s.run as never, store: s.store as never, onUpdate: () => {} });
    expect(out.filter((p) => p.status === "completed")).toHaveLength(buckets.length - 1);
    expect(out.find((p) => p.key === fk)!.status).toBe("failed");
    expect(caseStatusFor(out)).toBe("partial");
    expect(s.saved.filter((x) => x.status === "completed")).toHaveLength(buckets.length - 1);
    expect(Object.keys(mergeParts(out)).length).toBeGreaterThan(0);
  });

  it("TEST-R2/R3: resume reruns only the failed part, then case completes", async () => {
    const fk = initialParts(buckets)[1]!.key;
    const first = await runParts({ parts: initialParts(buckets), run: setup(fk).run as never, onUpdate: () => {} });
    const s = setup();
    const second = await runParts({ parts: first, run: s.run as never, onUpdate: () => {} });
    expect(s.calls).toEqual([fk]);
    expect(caseStatusFor(second)).toBe("completed");
    const r = applyReviewerParity(toReport(mergeParts(second), defaultReviewConfig()), defaultReviewConfig()).report;
    expect(buildReportBlocks(r).length).toBeGreaterThan(0);
  });

  it("per-part retry (`only`) touches just that part", async () => {
    const parts: PartState[] = initialParts(buckets).map((p, i) => ({ ...p, status: i === 0 ? "failed" : "completed", result: {} }));
    const s = setup();
    await runParts({ parts, run: s.run as never, onUpdate: () => {}, only: [parts[0]!.key] });
    expect(s.calls).toEqual([parts[0]!.key]);
  });

  it("network errors retry once with backoff; logic errors do not", async () => {
    const fk = initialParts(buckets)[0]!.key;
    const net = setup(fk, true);
    const a = await runParts({ parts: initialParts(buckets), run: net.run as never, onUpdate: () => {}, backoffMs: () => 1 });
    expect(net.calls.filter((c) => c === fk)).toHaveLength(2);
    expect(a.find((p) => p.key === fk)!.attempts).toBe(2);
    const logic = setup(fk, false);
    await runParts({ parts: initialParts(buckets), run: logic.run as never, onUpdate: () => {}, backoffMs: () => 1 });
    expect(logic.calls.filter((c) => c === fk)).toHaveLength(1);
  });

  it("TEST-R7: cloud store failure does not stop the review", async () => {
    const s = setup();
    const out = await runParts({ parts: initialParts(buckets), run: s.run as never, store: { save: async () => { throw new Error("down"); } }, onUpdate: () => {} });
    expect(caseStatusFor(out)).toBe("completed");
  });

  it("all failing parts → failed", async () => {
    const out = await runParts({ parts: initialParts(buckets), run: (async () => { throw new Error("x"); }) as never, onUpdate: () => {} });
    expect(caseStatusFor(out)).toBe("failed");
  });
});

describe("TEST-R5/R9 regression: sections & report", () => {
  it("every section id has a JSON mapping and section choice filters JSON", () => {
    const r = applyReviewerParity(toReport({ ...emptyModelOutput(), recommendations: ["أ"] }, defaultReviewConfig())).report;
    const all = selectJson(r, DEFAULT_REPORT_SECTIONS);
    expect(all["recommendations"]).toBeDefined();
    const off = Object.fromEntries(REPORT_SECTION_OPTIONS.map((o) => [o.id, false])) as typeof DEFAULT_REPORT_SECTIONS;
    expect(Object.keys(selectJson(r, off))).toEqual(["schema_version"]);
    expect(buildReportBlocks(r, off)).toHaveLength(0);
  });
});
