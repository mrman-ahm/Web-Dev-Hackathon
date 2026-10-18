# ADR 001: Modular monolith

Status: **Agreed architectural direction; detailed implementation proposed**. Date: 2026-10-18.

## Context

A 5–30-person service business needs one consistent CRM/lead/payment history; two development lanes must share transactions and contracts.

## Decision

Use one Next.js TypeScript application with cohesive modules and PostgreSQL transactions. Provider adapters and the protected worker are entrypoints in the same repository; no broker/microservice split.

## Alternatives considered

Microservices separate deployment but add distributed ownership/transaction failure. An unstructured app speeds initial screens but duplicates rules and permissions.

## Rationale

One deployment and database preserve atomic lead ownership and lower coordination overhead while module entrypoints support isolated development.

## Consequences

Enforce imports and command boundaries. Long-running work must use durable jobs; one HTTP handler is not a reliable workflow. Revisit services only with measured operational need.
