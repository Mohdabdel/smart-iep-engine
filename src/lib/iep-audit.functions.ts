import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { applyUnifiedRuleParity, runIepAudit } from "./iep-audit.server";
import { auditReportZodSchema } from "./iep-schema";

const inputSchema = z.object({
  documentName: z.string().min(1),
  documentText: z.string().min(40, "نص المستند قصير جداً أو فشل استخراجه."),
});

export const auditIep = createServerFn({ method: "POST" })
  .inputValidator((data) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    const report = await runIepAudit(undefined, data.documentName, data.documentText);
    const parity = applyUnifiedRuleParity(report);
    return {
      report: parity.report,
      parity: {
        bannedWordsStripped: parity.bannedStripped,
        singleCriterionFixes: parity.criterionFixes,
      },
    };
  });

export const auditIepInput = inputSchema;
export { auditReportZodSchema };
