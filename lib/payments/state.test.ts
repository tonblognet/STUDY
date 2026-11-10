import { describe, expect, it } from "vitest";
import {
  decidePaymentTransition,
  paymentStatuses,
  supportedProviderStatuses,
} from "./state";

describe("payment financial transitions", () => {
  it.each(["PENDING", "FAILED"] as const)(
    "grants once when %s receives a confirmed payment",
    (current) => {
      expect(decidePaymentTransition(current, "CONFIRMED")).toEqual({
        status: "SUCCEEDED",
        grant: true,
        revoke: false,
        changed: true,
        needsReview: false,
      });
    },
  );

  it("never grants for an authorization or intermediate bank state", () => {
    for (const status of [
      "NEW",
      "FORM_SHOWED",
      "AUTHORIZING",
      "3DS_CHECKING",
      "3DS_CHECKED",
      "AUTHORIZED",
      "CONFIRMING",
      "REVERSING",
      "REFUNDING",
    ])
      expect(decidePaymentTransition("PENDING", status)).toEqual({
        status: "PENDING",
        grant: false,
        revoke: false,
        changed: false,
        needsReview: false,
      });
  });

  it.each([
    "REJECTED",
    "CANCELED",
    "DEADLINE_EXPIRED",
    "AUTH_FAIL",
    "REVERSED",
  ])(
    "fails a pending payment for %s without granting or revoking",
    (status) => {
      expect(decidePaymentTransition("PENDING", status)).toEqual({
        status: "FAILED",
        grant: false,
        revoke: false,
        changed: true,
        needsReview: false,
      });
      expect(decidePaymentTransition("SUCCEEDED", status)).toEqual({
        status: "SUCCEEDED",
        grant: false,
        revoke: false,
        changed: false,
        needsReview: false,
      });
    },
  );

  it.each(["PENDING", "FAILED", "SUCCEEDED"] as const)(
    "records a refund before or after confirmation from %s",
    (current) => {
      expect(decidePaymentTransition(current, "REFUNDED")).toEqual({
        status: "REFUNDED",
        grant: false,
        revoke: true,
        changed: true,
        needsReview: false,
      });
      expect(decidePaymentTransition(current, "PARTIAL_REFUNDED")).toEqual({
        status: "PARTIALLY_REFUNDED",
        grant: false,
        revoke: true,
        changed: true,
        needsReview: false,
      });
    },
  );

  it("promotes partial to full refund without revoking a second time", () => {
    expect(decidePaymentTransition("PARTIALLY_REFUNDED", "REFUNDED")).toEqual({
      status: "REFUNDED",
      grant: false,
      revoke: false,
      changed: true,
      needsReview: false,
    });
  });

  it("absorbs late confirmations, failures and lower refund states", () => {
    for (const current of ["PARTIALLY_REFUNDED", "REFUNDED"] as const)
      for (const status of ["CONFIRMED", "REJECTED", "CANCELED", "AUTHORIZED"])
        expect(decidePaymentTransition(current, status)).toEqual({
          status: current,
          grant: false,
          revoke: false,
          changed: false,
          needsReview: false,
        });
    expect(
      decidePaymentTransition("REFUNDED", "PARTIAL_REFUNDED").changed,
    ).toBe(false);
  });

  it("has no financial side effects when any supported event repeats", () => {
    for (const current of paymentStatuses)
      for (const event of supportedProviderStatuses) {
        const first = decidePaymentTransition(current, event);
        const repeated = decidePaymentTransition(first.status, event);
        expect(repeated, `${current}: ${event}`).toMatchObject({
          status: first.status,
          grant: false,
          revoke: false,
          changed: false,
        });
      }
  });

  it("requires review of unknown states and partial authorization reversals", () => {
    for (const current of paymentStatuses)
      for (const event of ["UNKNOWN", "confirmed", "", "PARTIAL_REVERSED"])
        expect(decidePaymentTransition(current, event)).toEqual({
          status: current,
          grant: false,
          revoke: false,
          changed: false,
          needsReview: true,
        });
  });
});
