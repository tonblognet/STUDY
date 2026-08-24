# ADR 0001: Modular monolith

Status: accepted.

Use a single Next.js deployable with explicit domain/application/infrastructure boundaries. This minimizes operational load at Stage 1 while keeping ingestion, notification, AI and scoring contracts extractable. Microservices are deferred until independent scaling or ownership is measured.
