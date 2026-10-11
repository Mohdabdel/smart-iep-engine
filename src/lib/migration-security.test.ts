import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("migration security invariants", () => {
  it("authenticates both sensitive API routes before reading request bodies", () => {
    for (const path of ["../routes/api/audit.ts", "../routes/api/reviews.ts"]) {
      const code = source(path);
      const gate = code.indexOf("await requireAdmin(request)");
      const body = code.indexOf("await request.json()");
      expect(gate, path).toBeGreaterThan(-1);
      expect(body, path).toBeGreaterThan(gate);
      expect(code, path).toContain("if (gate instanceof Response) return gate");
    }
  });

  it("keeps service role access server-side and requires admin role", () => {
    const server = source("../integrations/supabase/client.server.ts");
    const auth = source("./require-admin.server.ts");
    expect(server).toContain('process.env[\'SUPABASE_SERVICE_ROLE_KEY\']');
    expect(server).not.toContain("import.meta.env");
    expect(auth).toContain('.eq("role", "admin")');
  });

  it("does not put private provider credentials in client-exposed VITE variables", () => {
    const provider = source("./ai-provider.server.ts");
    expect(provider).toContain('process.env["OPENAI_API_KEY"]');
    expect(provider).not.toContain("VITE_OPENAI_API_KEY");
    expect(provider).not.toContain("VITE_LOVABLE_API_KEY");
  });
});
