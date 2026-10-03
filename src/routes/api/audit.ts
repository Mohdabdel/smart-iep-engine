import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const inputSchema = z.object({
  documentName: z.string().min(1),
  documentText: z.string().min(40),
});

// Streams NDJSON keepalive pings while the long audit runs, then the final result.
export const Route = createFileRoute("/api/audit")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsedInput = inputSchema.safeParse(await request.json().catch(() => null));
        if (!parsedInput.success) {
          return Response.json({ error: "نص المستند قصير جداً أو فشل استخراجه." }, { status: 400 });
        }
        const { applyUnifiedRuleParity, runIepAudit } = await import("@/lib/iep-audit.server");
        const enc = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
            const ping = setInterval(() => send({ type: "ping" }), 5000);
            try {
              const report = await runIepAudit(
                undefined,
                parsedInput.data.documentName,
                parsedInput.data.documentText,
              );
              const parity = applyUnifiedRuleParity(report);
              send({
                type: "result",
                data: {
                  report: parity.report,
                  parity: {
                    bannedWordsStripped: parity.bannedStripped,
                    singleCriterionFixes: parity.criterionFixes,
                  },
                },
              });
            } catch (e) {
              console.error("[audit]", e);
              send({ type: "error", message: e instanceof Error ? e.message : "فشل التدقيق." });
            } finally {
              clearInterval(ping);
              controller.close();
            }
          },
        });
        return new Response(stream, {
          headers: {
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
          },
        });
      },
    },
  },
});
