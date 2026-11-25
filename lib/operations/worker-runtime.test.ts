import { describe, expect, it } from "vitest";
import { smtpConnectionOptions } from "../notifications/email";
import {
  deadlineWorkerHeartbeatRecent,
  deadlineWorkerSettings,
} from "./worker-runtime";

const staging = {
  DEPLOYMENT_MODE: "staging",
  CATALOG_STORAGE: "database",
  DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:55432/worker_test",
};
const email = {
  DEADLINE_EMAIL_ENABLED: "true",
  APP_URL: "https://fixture.example.invalid",
  SMTP_URL: "smtp://fixture:fixture-password@127.0.0.1:1027",
  EMAIL_FROM: "Fixture <fixture@example.invalid>",
};
const production = {
  ...staging,
  ...email,
  DEPLOYMENT_MODE: "production",
  DATABASE_URL: `${staging.DATABASE_URL}?sslmode=require&sslaccept=strict`,
};

describe("deadline worker startup configuration", () => {
  it("allows a disabled-mail staging worker without web auth or SMTP secrets", () => {
    expect(deadlineWorkerSettings(staging)).toEqual({
      mode: "staging",
      delivery: undefined,
    });
  });

  it.each([undefined, "", "prod", "Production", "production-secret"])(
    "rejects absent or unknown deployment modes before accepting SMTP settings",
    (DEPLOYMENT_MODE) => {
      expect(() =>
        deadlineWorkerSettings({ ...production, DEPLOYMENT_MODE }),
      ).toThrow(/^DEPLOYMENT_MODE invalid$/);
    },
  );

  it("requires database catalog storage and rejects non-PostgreSQL URLs", () => {
    expect(() =>
      deadlineWorkerSettings({ ...staging, CATALOG_STORAGE: "snapshot" }),
    ).toThrow(/^CATALOG_STORAGE invalid$/);
    expect(() =>
      deadlineWorkerSettings({
        ...staging,
        DATABASE_URL: "https://private-credentials.example.invalid/database",
      }),
    ).toThrow(/^DATABASE_URL invalid$/);
  });

  it.each([
    staging.DATABASE_URL,
    `${staging.DATABASE_URL}?sslmode=require&sslaccept=accept_invalid_certs`,
    `${staging.DATABASE_URL}?sslmode=require&sslaccept=strict&sslmode=disable`,
  ])(
    "requires strict production database TLS even with email disabled",
    (DATABASE_URL) => {
      expect(() =>
        deadlineWorkerSettings({
          ...production,
          DATABASE_URL,
          DEADLINE_EMAIL_ENABLED: "false",
        }),
      ).toThrow(/^DATABASE_URL invalid$/);
    },
  );

  it("accepts explicit production with strict database TLS and SMTP STARTTLS", () => {
    expect(deadlineWorkerSettings(production)).toEqual({
      mode: "production",
      delivery: { appOrigin: email.APP_URL },
    });
    expect(smtpConnectionOptions(email.SMTP_URL, true)).toMatchObject({
      requireTLS: true,
      tls: { rejectUnauthorized: true },
    });
  });

  it("allows loopback HTTP for staging mail links only", () => {
    const APP_URL = "http://127.0.0.1:3100";
    expect(
      deadlineWorkerSettings({ ...staging, ...email, APP_URL }).delivery,
    ).toEqual({ appOrigin: APP_URL });
    expect(() => deadlineWorkerSettings({ ...production, APP_URL })).toThrow(
      /^APP_URL invalid$/,
    );
    expect(() =>
      deadlineWorkerSettings({ ...production, APP_URL: "https://localhost" }),
    ).toThrow(/^APP_URL invalid$/);
  });

  it("rejects noncanonical links and SMTP options without disclosing credentials", () => {
    expect(() =>
      deadlineWorkerSettings({
        ...production,
        APP_URL:
          "https://private-user:private-password@fixture.example.invalid",
      }),
    ).toThrow(/^APP_URL invalid$/);
    expect(() =>
      deadlineWorkerSettings({
        ...production,
        SMTP_URL: `${email.SMTP_URL}?ignoreTLS=true&token=private-secret`,
      }),
    ).toThrow(/^SMTP_URL invalid$/);
  });

  it("rejects malformed sender and delivery flags before processing jobs", () => {
    expect(() =>
      deadlineWorkerSettings({
        ...production,
        EMAIL_FROM: "fixture@example.invalid\r\nBcc: private@example.invalid",
      }),
    ).toThrow(/^EMAIL_FROM invalid$/);
    expect(() =>
      deadlineWorkerSettings({ ...production, DEADLINE_EMAIL_ENABLED: "1" }),
    ).toThrow(/^DEADLINE_EMAIL_ENABLED invalid$/);
  });
});

describe("deadline worker heartbeat", () => {
  const now = Date.UTC(2026, 10, 11, 8, 0, 0);

  it("accepts a current successful cycle and the five-minute boundary", () => {
    expect(deadlineWorkerHeartbeatRecent(new Date(now), now)).toBe(true);
    expect(deadlineWorkerHeartbeatRecent(new Date(now - 300_000), now)).toBe(
      true,
    );
  });

  it("rejects future, stale, absent and invalid heartbeat times", () => {
    expect(deadlineWorkerHeartbeatRecent(new Date(now + 1), now)).toBe(false);
    expect(deadlineWorkerHeartbeatRecent(new Date(now - 300_001), now)).toBe(
      false,
    );
    expect(deadlineWorkerHeartbeatRecent(null, now)).toBe(false);
    expect(deadlineWorkerHeartbeatRecent(undefined, now)).toBe(false);
    expect(deadlineWorkerHeartbeatRecent(new Date(NaN), now)).toBe(false);
    expect(deadlineWorkerHeartbeatRecent(new Date(now), NaN)).toBe(false);
  });
});
