import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const sourceState = z.enum(["attached", "external_verified", "unavailable"]);
const inputSchema = z.object({
  config: z.object({
    review_type: z.enum(["full", "quality", "supervisory", "goals", "plaafp", "post_correction", "compare_previous"]),
    sources: z.record(z.string(), sourceState),
    criteria: z.record(z.string(), z.object({ state: z.enum(["active", "frozen", "na"]), reason: z.string().optional() })),
    transition_applicability: z.record(z.string(), z.enum(["unset", "applies", "na"])).optional(),
  }),
  keys: z.array(z.string()).min(1),
  documents: z
    .array(z.object({ source: z.string(), name: z.string().min(1), text: z.string() }))
    .min(1)
    .refine((docs) => docs.some((d) => d.source === "current_plan" && d.text.length >= 40), "نص الخطة الحالية قصير جداً أو فشل استخراجه."),
});

// Streams NDJSON keepalive pings while the long audit runs, then the final result.
export const Route = createFileRoute("/api/audit")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsedInput = inputSchema.safeParse(await request.json().catch(() => null));
        if (!parsedInput.success) {
          return Response.json({ error: "نص المستند قصير جداً أو فشل استخراجه، أو إعدادات المراجعة غير صالحة." }, { status: 400 });
        }
        const { runIepAudit } = await import("@/lib/iep-audit.server");
        const enc = new TextEncoder();
        let closed = false;
        let ping: ReturnType<typeof setInterval> | undefined;
        const stream = new ReadableStream({
          cancel() {
            closed = true;
            clearInterval(ping);
          },
          async start(controller) {
            const send = (o: unknown) => {
              if (closed) return;
              try {
                controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
              } catch {
                closed = true;
              }
            };
            ping = setInterval(() => send({ type: "ping" }), 5000);
            try {
              const config = parsedInput.data.config as import("@/lib/criteria-registry").ReviewConfig;
              const { keysForReviewType } = await import("@/lib/iep-schema");
              const allowed = new Set<string>(keysForReviewType(config.review_type));
              const keys = parsedInput.data.keys.filter((k) => allowed.has(k)) as import("@/lib/iep-schema").ModelKey[];
              if (!keys.length) throw new Error("أجزاء المراجعة المطلوبة غير صالحة.");
              const partial = await runIepAudit(config, parsedInput.data.documents, keys);
              send({ type: "result", data: { partial } });
            } catch (e) {
              console.error("[audit]", e);
              send({ type: "error", message: e instanceof Error ? e.message : "فشل التدقيق." });
            } finally {
              clearInterval(ping);
              if (!closed) {
                closed = true;
                try {
                  controller.close();
                } catch {
                  /* already closed */
                }
              }
            }
          },
        });
        return new Response(stream, {
          headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform" },
        });
      },
    },
  },
});
