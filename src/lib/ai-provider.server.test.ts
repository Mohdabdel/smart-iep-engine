import { afterEach, describe, expect, it } from "vitest";
import { createIepAiProvider } from "./ai-provider.server";

const original = {
  IEP_AI_PROVIDER: process.env["IEP_AI_PROVIDER"],
  LOVABLE_API_KEY: process.env["LOVABLE_API_KEY"],
  OPENAI_API_KEY: process.env["OPENAI_API_KEY"],
  IEP_OPENAI_MODEL: process.env["IEP_OPENAI_MODEL"],
};

afterEach(() => {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("IEP AI provider configuration", () => {
  it("defaults to Lovable without invoking any API", () => {
    delete process.env["IEP_AI_PROVIDER"];
    process.env["LOVABLE_API_KEY"] = "test-placeholder";
    const result = createIepAiProvider();
    expect(result.model).toBe("openai/gpt-6-astra");
  });

  it("requires an explicit model for the direct provider", () => {
    process.env["IEP_AI_PROVIDER"] = "openai";
    process.env["OPENAI_API_KEY"] = "test-placeholder";
    delete process.env["IEP_OPENAI_MODEL"];
    expect(() => createIepAiProvider()).toThrow("IEP_OPENAI_MODEL");
  });

  it("rejects unsupported provider settings", () => {
    process.env["IEP_AI_PROVIDER"] = "invalid";
    expect(() => createIepAiProvider()).toThrow("Unsupported");
  });

  it("does not make a network request to initialize a direct provider", () => {
    process.env["IEP_AI_PROVIDER"] = "openai";
    process.env["OPENAI_API_KEY"] = "test-placeholder";
    process.env["IEP_OPENAI_MODEL"] = "test-model";
    expect(createIepAiProvider().model).toBe("test-model");
  });
});
