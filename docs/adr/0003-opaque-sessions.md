# ADR 0003: Opaque database sessions

Status: accepted.

Email/password authentication uses random opaque session tokens. Only the token hash is persisted. This enables per-device revoke, logout-all and immediate role/security invalidation without long-lived JWT revocation complexity.
