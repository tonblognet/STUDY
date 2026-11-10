export const paymentStatuses = [
  "PENDING",
  "SUCCEEDED",
  "FAILED",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
] as const;

export type PaymentStatus = (typeof paymentStatuses)[number];

export const supportedProviderStatuses = [
  "NEW",
  "FORM_SHOWED",
  "AUTHORIZING",
  "3DS_CHECKING",
  "3DS_CHECKED",
  "AUTHORIZED",
  "CONFIRMING",
  "CONFIRMED",
  "REVERSING",
  "PARTIAL_REVERSED",
  "REVERSED",
  "REFUNDING",
  "PARTIAL_REFUNDED",
  "REFUNDED",
  "CANCELED",
  "DEADLINE_EXPIRED",
  "REJECTED",
  "AUTH_FAIL",
] as const;

export type ProviderPaymentStatus = (typeof supportedProviderStatuses)[number];

export type PaymentTransition = {
  status: PaymentStatus;
  grant: boolean;
  revoke: boolean;
  needsReview: boolean;
  changed: boolean;
};

const supported = new Set<string>(supportedProviderStatuses);
const failures = new Set<string>([
  "REJECTED",
  "CANCELED",
  "DEADLINE_EXPIRED",
  "AUTH_FAIL",
  "REVERSED",
]);

/** Apply under the payment lock after authenticating and matching the bank event. */
export function decidePaymentTransition(
  current: PaymentStatus,
  providerStatus: string,
): PaymentTransition {
  const unchanged: PaymentTransition = {
    status: current,
    grant: false,
    revoke: false,
    needsReview: false,
    changed: false,
  };
  // A partial reversal of an authorization is not a captured-payment refund.
  if (!supported.has(providerStatus) || providerStatus === "PARTIAL_REVERSED")
    return { ...unchanged, needsReview: true };

  // Refunds dominate delayed confirmations, failures and lower refund states.
  if (current === "REFUNDED") return unchanged;
  if (providerStatus === "REFUNDED")
    return {
      status: "REFUNDED",
      grant: false,
      revoke: current !== "PARTIALLY_REFUNDED",
      needsReview: false,
      changed: true,
    };
  if (current === "PARTIALLY_REFUNDED") return unchanged;
  // Policy: any confirmed refund revokes this payment's grant. Other payments'
  // grants are unaffected. A later full refund must not revoke it a second time.
  if (providerStatus === "PARTIAL_REFUNDED")
    return {
      status: "PARTIALLY_REFUNDED",
      grant: false,
      revoke: true,
      needsReview: false,
      changed: true,
    };

  if (providerStatus === "CONFIRMED" && current !== "SUCCEEDED")
    return {
      status: "SUCCEEDED",
      grant: true,
      revoke: false,
      needsReview: false,
      changed: true,
    };
  if (failures.has(providerStatus) && current === "PENDING")
    return {
      status: "FAILED",
      grant: false,
      revoke: false,
      needsReview: false,
      changed: true,
    };
  return unchanged;
}
