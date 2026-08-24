# Security

## Baseline

- Passwords: bcrypt work factor 12; never logged or returned.
- Sessions: 256-bit opaque token, only SHA-256 hash stored, `HttpOnly`, `Secure` in production, `SameSite=Lax`, rotation after authentication/2FA.
- One-time tokens: random 256-bit value, hashed at rest, single use, short expiry.
- Authorization: server-side RBAC and resource ownership on every command; UI visibility is not a boundary.
- Validation: Zod allowlists, payload size limits and mass-assignment-safe command DTOs.
- Mutations: same-origin/CSRF checks, rate-limit port, idempotency for payments/imports/jobs.
- Headers: CSP, HSTS in production, `nosniff`, strict referrer and permissions policies.
- Secrets: environment/secret manager only; `.env` is ignored; no secret value in client bundles.

## Threat controls

| Threat                       | Control                                                                   |
| ---------------------------- | ------------------------------------------------------------------------- |
| Broken auth/session fixation | rotated opaque sessions, expiry, revoke-all, 2FA challenge                |
| IDOR/role escalation         | ownership policy and explicit role matrix in service layer                |
| SQL injection                | Prisma parameterization; no interpolated raw SQL                          |
| XSS                          | React escaping, CSP, no unsafe HTML from imported sources                 |
| CSRF/open redirect           | origin validation and relative-return allowlist                           |
| SSRF                         | ingestion URL allowlist, DNS/IP checks, redirect limits, time/size caps   |
| Brute force                  | distributed rate-limit interface, generic auth responses, security events |
| Webhook forgery/replay       | provider signature/token check, terminal allowlist, idempotency key       |
| Subscription bypass          | entitlements derived server-side from confirmed active subscription       |
| Prompt injection             | scraped text treated as untrusted data; AI receives structured tools only |

## Sensitive logging

Never log passwords, session/verification/reset tokens, card/payment credentials, raw profile answers, email bodies, documents or AI prompts containing personal data. Logs use stable pseudonymous ids. Audit logs record actor, action, entity, outcome and safe diff.

## Incident response

1. Disable affected provider/feature flag and revoke compromised sessions/secrets.
2. Preserve immutable logs and identify affected records/time window.
3. Restore from a verified backup if integrity is affected.
4. Notify owners/users/regulators as legally required.
5. Rotate secrets, patch, add regression tests and publish an internal postmortem.

## Release checklist

`pnpm lint`, `pnpm typecheck`, `pnpm test`, integration/E2E, `pnpm security:audit`, secret scan, migration review and `git diff` review. Production launch additionally requires external penetration testing and a Russian personal-data/legal compliance review.
