import { describe, expect, it } from "vitest";
import { deploymentIssues } from "./readiness";

const staging = {
  DEPLOYMENT_MODE: "staging",
  CATALOG_STORAGE: "database",
  APP_URL: "http://127.0.0.1:3000",
  AUTH_SECRET: "readiness-fixture-secret-at-least-32-characters",
  DATABASE_URL: "postgresql://fixture:fixture@localhost:5432/readiness_test",
  SMTP_URL: "smtp://localhost:1025",
  EMAIL_FROM: "Fixture <fixture@example.invalid>",
};

describe("deployment readiness", () => {
  it("requires an explicitly configured DB deployment and mail settings", () => {
    expect(deploymentIssues(staging)).toEqual([]);
    expect(
      deploymentIssues({ ...staging, CATALOG_STORAGE: "snapshot" }),
    ).toEqual(["CATALOG_STORAGE"]);
    expect(deploymentIssues({})).toEqual([
      "DEPLOYMENT_MODE",
      "CATALOG_STORAGE",
      "APP_URL",
      "AUTH_SECRET",
      "DATABASE_URL",
      "SMTP_URL",
      "EMAIL_FROM",
    ]);
  });
  it("requires public HTTPS and explicit trusted-proxy configuration in production", () => {
    const production = {
      ...staging,
      DEPLOYMENT_MODE: "production",
      APP_URL: "https://postupai.ru",
      TRUST_PROXY: "true",
      DATABASE_URL: `${staging.DATABASE_URL}?sslmode=require&sslaccept=strict`,
    };
    expect(deploymentIssues(production)).toEqual([]);
    expect(
      deploymentIssues({ ...production, APP_URL: staging.APP_URL }),
    ).toEqual(["APP_URL"]);
    expect(deploymentIssues({ ...production, TRUST_PROXY: "false" })).toEqual([
      "TRUST_PROXY",
    ]);
    expect(
      deploymentIssues({ ...production, DATABASE_URL: staging.DATABASE_URL }),
    ).toEqual(["DATABASE_URL"]);
  });
  it.each([
    "http://untrusted.example",
    "https://example.com/nested",
    "https://example.com/?token=private",
    "https://user:secret@example.com",
  ])(
    "rejects unsuitable configured origins without returning their values",
    (APP_URL) => {
      expect(deploymentIssues({ ...staging, APP_URL })).toEqual(["APP_URL"]);
    },
  );
  it("rejects invalid connection/from settings and the example auth secret", () => {
    expect(
      deploymentIssues({
        ...staging,
        DATABASE_URL: "http://password.example/secret",
        SMTP_URL: "https://password.example/secret",
        EMAIL_FROM: "fixture@example.invalid\r\nBcc: secret@example.invalid",
        AUTH_SECRET: "replace-with-at-least-32-random-characters",
      }),
    ).toEqual(["AUTH_SECRET", "DATABASE_URL", "SMTP_URL", "EMAIL_FROM"]);
  });
});
