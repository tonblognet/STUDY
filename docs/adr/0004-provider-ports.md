# ADR 0004: External provider ports

Status: accepted.

Payments, notifications, email, queues, analytics and AI are accessed through internal ports. Concrete SDKs/adapters stay in infrastructure. Missing credentials select explicit development adapters only; production fails closed.
