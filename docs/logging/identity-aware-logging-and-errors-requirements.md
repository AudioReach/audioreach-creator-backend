<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Identity-Aware Logging and Errors: Requirements

**Date:** 2026-09-21
**Status:** Frozen (amended 2026-10-30)
**Amendment 2026-10-30:** One identity scheme for logs and user messages.
Known entities are identified by natural identity only; the hexadecimal system
ID is used only when natural identity is missing. Affects FR-ILE-05, FR-ILE-10,
FR-ILE-11, FR-ILE-17, FR-ILE-23, I2, and Resolved Decisions 3 and 12.
**Amendment 2026-10-31:** `source` is replaced by producer identity
(`service_name`, `service_instance_id`) and the originating client instance,
and a client can export the logs of its own session. Affects FR-ILE-11,
FR-ILE-13, FR-ILE-18, FR-ILE-23, Resolved Decision 10, and adds FR-ILE-24,
FR-ILE-25, and Resolved Decision 13.
**Initial adoption:** Use-case-routing workflows implemented through PR 6
**Target scope:** Project-wide

## 1. Context

### 1.1 Problem statement

Server logs and user-facing errors inconsistently identify entities. Many
messages contain only internal `systemId` values, often as decimal numbers.
Those values are useful to persistence and client workflows but do not help an
end user understand which domain entity caused or was affected by an event.

The project needs one identity policy for diagnostics, audit-style logs, and
API issues. The policy must distinguish human-readable identity from opaque
machine correlation and must work for both ordinary entities and composite
entities such as links and UseCases.

### 1.2 Existing behavior

- `Logger` accepts generic `LogData` with `msg`, `description`, `component`,
  `tag`, optional `projectId`, and optional `error`.
- HTTP middleware, `CommandBus`, the exception filter, and a small number of
  handlers/helpers log independently.
- Request headers, bodies, and response bodies can currently be logged without
  a project-wide redaction and size policy.
- `Issue` supports one `impactedEntity` plus a separate
  `impactedUsecases: number[]`; multi-entity facts are often flattened into
  message text.
- User-facing issue and exception messages frequently contain raw system IDs.
- Core domain entities usually carry their natural identity. DataLink and
  ControlLink are notable exceptions because their useful identity is their
  endpoint tuple.

### 1.3 Delivery strategy

The architecture and contracts shall be project-wide. Use-case routing shall
be the first complete adoption and validation case. Other workflows may be
migrated incrementally without introducing feature-specific identity or
logging architectures.

The application is not yet in production. Clean contract changes are allowed;
the design shall not add compatibility shims solely to preserve unreleased
issue or logging shapes.

## 2. Definitions

| Term | Definition |
|------|------------|
| System ID | Internal persistence identity used for joins, commands, correlation, and updates. |
| Natural identity | Domain identity meaningful to users. It may be a natural ID, a named natural ID, a GKV, or a composite endpoint tuple. |
| Display label | Concise, server-produced text derived from natural identity for logs or user messages. |
| Entity reference | Structured machine context containing entity type, opaque system ID when needed, natural identity, and display label. |
| User message | Concise prose safe for direct display. It never requires parsing. It uses natural identity for known entities; when natural identity is missing (typically a caller-supplied system ID that resolves to no entity), it uses the labelled hexadecimal system ID. |
| Issue context | Structured, issue-code-specific data used by the client for highlighting, selection, dialogs, and follow-up commands. It is not displayed verbatim. |
| Diagnostic log | Best-effort operational information used to troubleshoot behavior and failures. |
| Audit event | Best-effort record of a meaningful user or system mutation. It is not a compliance-grade transactional audit record. |

## 3. Functional Requirements

### 3.1 Project-wide identity policy

#### FR-ILE-01: One identity policy

All features shall use one project-wide policy for representing entity identity
in server logs and API issues. Features may define entity-specific natural
identity adapters but shall not invent independent formatting conventions.

#### FR-ILE-02: Domain identity is authoritative

For ordinary entities, identity construction shall use the natural ID and
human-readable fields already present on the domain entity or read model held
by the caller. Optional aliases and names supplement natural identity; they do
not replace it.

#### FR-ILE-03: Composite identities

Entities without a standalone natural ID shall use a documented composite
identity:

- UseCase: ordered GKV pairs represented as
  `keyName:valueName (keyNaturalId:valueNaturalId)`; alias is supplemental.
- DataLink: directional source module/port to destination module/port identity.
- ControlLink: canonical A/B module/port identity.
- SGKV, CKV, and TKV: owning entity plus their natural key/value content.
- A base Node shall resolve to its concrete Module or Subsystem identity.

If no canonical natural identity is known, implementation shall stop and obtain
an explicit domain decision rather than substitute an optional label or raw
system ID.

#### FR-ILE-04: Canonical formatting

Natural IDs shall have one canonical representation across the application.
Collections and composite identities shall use deterministic ordering so the
same entity is rendered consistently across requests, logs, and issues.

### 3.2 User-facing errors and issues

#### FR-ILE-05: No system IDs in user messages

User-facing issue and exception messages shall not identify known entities by
system ID. Messages shall use natural identity and concise domain language.
When natural identity is missing, the message shall identify the entity by its
expected entity type and labelled hexadecimal system ID (for example
`Module with systemId: 0x10000002`). The usual case is a caller-supplied system
ID that resolves to no entity in the requested scope; the same fallback applies
in the rare case that natural identity cannot be resolved for an entity that
exists. Unexpected internal failures shall return an opaque message and
correlation ID rather than internal identifiers or exception details.

#### FR-ILE-06: Simple issue presentation

An atomic issue shall contain a complete, directly displayable message using
the affected entity's natural identity. The client shall not need to parse the
message to identify the entity.

#### FR-ILE-07: Composite issue presentation

A large or multi-entity issue shall contain a concise summary message and a
typed, issue-code-specific context. For example, routing deletion selection
shall provide separate `affectedUsecases` and `missingUsecases` collections.
The client shall branch on the issue code and read context to build rich UI,
not parse the message.

#### FR-ILE-08: Entity reference contract

Issue context shall use a shared entity-reference vocabulary. A reference
shall provide structured natural identity and a display label. It may carry an
opaque system ID only when the client needs it for a follow-up command,
selection, or correlation. The UI shall not display that system ID.

#### FR-ILE-09: Preserve issue semantics

Identity improvements shall not alter issue codes, severity, blocking versus
non-blocking behavior, HTTP status, fix semantics, or transaction outcome
unless a separate requirement explicitly changes them.

### 3.3 Server diagnostics and audit events

#### FR-ILE-10: Diagnostic identity

Server logs shall identify entities with the same scheme as user messages:
natural identity for known entities, and the labelled hexadecimal system ID
only when natural identity is missing. Natural IDs are sufficient for
persistence-level correlation, so a system ID is not appended to a known
entity.

#### FR-ILE-11: Audit event identity

Audit-style mutation events shall identify the operation, producing service,
project scope, affected entity using its identity under FR-ILE-10, and the
committed outcome. Failed or rolled-back mutations shall not be
recorded as successful audit events.

#### FR-ILE-12: Logging ownership

The design shall define non-overlapping ownership for HTTP lifecycle logs,
command/query lifecycle logs, domain mutation audit events, recoverable service
warnings, and exception logs. A single failure shall not be redundantly logged
at every layer. Every log entry shall distinguish its operation (`action`) from
the stable event name within that operation (`eventName`).

#### FR-ILE-13: Correlation

Logs produced for one client request shall share an explicit correlation ID
where available. Historical diagnostics shall primarily use producing service,
client instance, project, operation, timestamp, and natural entity identity.
Correlation shall not be encoded into overloaded fields such as `tag`. Worker
threads shall remain logger-free; their parent adapter shall preserve the
originating request correlation, including the client instance (FR-ILE-24),
for task failures and timeouts without mixing
parallel or stale task results.

### 3.4 Identity resolution

#### FR-ILE-14: No unnecessary lookup

Ordinary entity identity shall be obtained from the domain entity or read model
already held by the caller. Logging shall not re-query persistence for data the
business operation already loaded.

#### FR-ILE-15: Shared link identity resolution

DataLink and ControlLink endpoint identity resolution shall be a reusable core
port, not a routing-specific service. Its persistence adapter shall support
batched, file-scoped resolution and effective session state where applicable.

#### FR-ILE-16: Bounded enrichment

When an operation needs identities not already loaded, enrichment shall be
batched and request-scoped. It shall not introduce one database call per entity
or hidden persistence I/O inside pure domain services, issue formatters, or the
logger adapter.

#### FR-ILE-17: Best-effort behavior

Diagnostic logging, audit logging, and identity enrichment are best-effort.
Their failure shall not fail, roll back, or replace the primary business
operation or error. When natural identity cannot be resolved, logs and
messages shall both fall back to the labelled hexadecimal system ID
(FR-ILE-05, FR-ILE-10). The protected server log for an
unexpected failure shall retain the original exception, stack, correlation ID,
and any available system IDs even when natural identity resolution is
incomplete.

### 3.5 HTTP payload logging and security

#### FR-ILE-18: Metadata-only HTTP logging

HTTP lifecycle logging shall record method, route template, status, duration,
producing service, client instance when supplied, project when known, and
correlation ID when available. Existing unrestricted header, request-body, and response-body debug
logging shall be removed. This delivery shall not introduce payload capture at
any log level. A future opt-in payload diagnostic mode requires separate
requirements based on a concrete support need.

#### FR-ILE-19: Prohibited HTTP log data

Authorization headers, cookies, credentials, tokens, raw uploaded file
contents, request bodies, and response bodies shall not be logged. Query values
and route-parameter values shall not be included in lifecycle metadata.

#### FR-ILE-20: Safe error exposure

Stack traces and internal exception details may be written to protected server
logs but shall not be returned through user-facing APIs or client-accessible
log endpoints. Client-accessible log projections shall omit protected error and
stack fields even when those values are retained in `logging.db` for a supplied
diagnostic bundle.

### 3.6 Adoption and verification

#### FR-ILE-21: Routing reference implementation

The auto and manual use-case-routing workflows through PR 6 shall be the first
complete migration. Their issue factories, handlers, phases, and supporting
link/KV identity reads shall demonstrate the project-wide contracts.

#### FR-ILE-22: Incremental project migration

Other features shall migrate incrementally using the same contracts and
policies. The design shall identify a mechanical audit method and migration
order without requiring a flag day.

#### FR-ILE-23: Verification

Tests shall cover identity formatting, composite identities, deterministic
ordering, complete and partial resolution, cross-file/session isolation,
batched link resolution, no system IDs for known entities in messages or logs,
labelled hexadecimal system IDs when natural identity is missing (including
scoped not-found messages), correlation propagation, producer and
client-instance identity on every log, client-session export, absence of HTTP
header/body/query-value logging, and logging failure that does not affect
business outcomes.

### 3.7 Producer identity and client-session logs

#### FR-ILE-24: Producer and client-instance identity

Every log record shall identify the program that wrote it with the
OpenTelemetry resource fields `service.name` and `service.instance.id`, stored
as `service_name` and `service_instance_id`. A server record written while
handling a request from a client instance shall also store that instance as
`client_instance_id`. Infrastructure shall set all three; core log calls shall
not. A server record shall never carry a client's resource identity, and a
client shall not be able to submit records under a server service name. The
authenticated client ID shall not be used as a log producer or ownership key.
Server records shall be selectable with a simple `service_name` filter.

#### FR-ILE-25: Client-session log export

A client shall be able to retrieve, with bounded pagination, every record of
one client instance: the records it submitted and the server records written
for it, across projects, in timestamp order. The client decides the export
file format. Instance IDs select records but do not grant access.

## 4. Invariants

**I1 - Internal identity remains canonical:** Domain logic, persistence joins,
commands, edit actions, and routing algorithms continue to use system IDs where
they do today.

**I2 - User identity is natural:** User-visible messages describe known entities
through approved natural identities and domain wording. When natural identity
is missing, the labelled hexadecimal system ID is used instead. Logs follow the
same scheme.

**I3 - Machine context is not presentation:** Opaque IDs and structured issue
context may support client behavior but are never rendered directly to users.

**I4 - Identity enrichment is side-effect free:** Enrichment cannot mutate
domain state, transaction state, or the primary result.

**I5 - Scope isolation:** Identity resolution never returns an entity from a
different project, file, or effective session view.

**I6 - Core remains framework-independent:** Core logging and issue contracts
do not depend on NestJS, TypeORM, Pino, or Node.js APIs.

## 5. Non-Functional Requirements

**NFR-ILE-01 - Performance:** Identity enrichment uses existing objects first
and bounded batch reads second. No N+1 identity lookup is permitted.

**NFR-ILE-02 - Reliability:** Logger, transport, and enrichment failures are
observable where possible but do not alter business outcomes.

**NFR-ILE-03 - Security:** Logging follows data minimization and bounded field
sizes. This delivery records HTTP metadata only. Any future payload logging must
introduce central redaction and bounded payload-size rules before capture is
enabled.

**NFR-ILE-04 - Testability:** Identity construction and message formatting are
pure and testable without infrastructure. Persistence resolution is tested at
the adapter boundary.

**NFR-ILE-05 - Evolvability:** Adding a new entity identity does not require
changes to the logger transport, persistence schema, or unrelated features.

## 6. Out of Scope

- Compliance-grade, transactionally guaranteed audit storage.
- Replacing command and repository system-ID contracts with natural IDs.
- Logging raw file contents, secrets, credentials, or unrestricted payloads.
- Adding an opt-in HTTP request/response payload diagnostic mode.
- Localizing user-facing messages in the first delivery.
- Migrating every existing feature in the routing reference implementation.
- Changing routing algorithms or domain behavior while adopting logging.

## 7. Resolved Decisions

1. The architecture is project-wide; routing is the first adoption case.
2. It covers both server logs and user-facing errors/issues.
3. User messages use natural identity for known entities. When natural identity
   is missing, typically for a caller-supplied ID that is not found, they use
   the labelled hexadecimal system ID.
4. Clients use typed issue context, not message parsing, for rich interactions.
5. Multi-entity issue context uses named, issue-specific fields rather than a
   generic entity role string.
6. Opaque system IDs may remain in issue context when required for client
   actions, but the UI does not display them.
7. Diagnostics and audit-style logs are best-effort.
8. HTTP lifecycle logs contain metadata only. Existing unrestricted
   header/body logging is removed; richer payload diagnostics are deferred.
9. Logging is optimized for a per-desktop server whose logs and source database
   files are later supplied as a diagnostic bundle, not for a centrally
   operated multi-user service.
10. `source` is removed (amended 2026-10-31). Producer identity uses
    `service_name` and `service_instance_id`, and server records carry the
    originating `client_instance_id` (FR-ILE-24). Project scope is sufficient
    for historical server-log filtering. File, session, command/query,
    operation-group, and separate actor IDs are not mandatory log fields.
11. Worker tasks return serializable diagnostics to the parent process. The
    parent owns persistence and preserves per-task request correlation.
12. Logs and user messages share one identity scheme (amended 2026-10-30).
    System IDs are not appended to known entities in logs.
13. A client instance is one UI launch, identified by a UUID the UI generates
    and sends on every request (amended 2026-10-31). An event is one HTTP
    request; per-request correlation uses trace IDs in later work.

## 8. Open Questions

None.
