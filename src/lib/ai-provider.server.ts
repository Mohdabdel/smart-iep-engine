import { createOpenAI } from "@ai-sdk/openai";
import { createLovableAiGatewayRunIdFetch } from "./gateway-run-id";

/**
 * Server-only provider selection. The existing Lovable gateway remains the
 * default to preserve baseline behavior. Direct API is opt-in for staging.
 *
 * Do not expose API keys via VITE_* variables.
 */
export function createIepAiProvider() {
  const mode = process.env["IEP_AI_PROVIDER"] ?? "lovable";
  if (mode === "lovable") {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("لم يتم تهيئة مفتاح محرك الذكاء الاصطناعي على الخادم.");
    const runIdFetch = createLovableAiGatewayRunIdFetch(undefined);
    return {
      provider: createOpenAI({
        baseURL: "https://ai.gateway.lovable.dev/v1",
        apiKey,
        headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
        fetch: runIdFetch.fetch,
      }),
      model: "openai/gpt-6-astra",
      lightModel: process.env["IEP_LIGHT_MODEL"] || undefined,
    };
  }
  if (mode === "openai") {
    const apiKey = process.env["OPENAI_API_KEY"];
    const model = process.env["IEP_OPENAI_MODEL"];
    if (!apiKey) throw new Error("OPENAI_API_KEY is required for direct provider.");
    if (!model) throw new Error("IEP_OPENAI_MODEL must be verified and explicitly configured.");
    // نموذج أخف اختياري لمهام الحصر والنقل؛ يُضبط صراحةً من المالك بعد التحقق منه
    const lightModel = process.env["IEP_OPENAI_LIGHT_MODEL"] || undefined;
    return { provider: createOpenAI({ apiKey }), model, lightModel };
  }
  throw new Error("Unsupported IEP_AI_PROVIDER; expected lovable or openai.");
}
