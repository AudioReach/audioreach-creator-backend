<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Distributed Observability Requirements

**Status:** Assumed requirements baseline for design review (amended 2026-10-31)  
**Date:** 2026-09-30  
**Amendment 2026-10-31:** Aligned with the producer and client-instance
identity decisions in
[Identity-Aware Logging and Errors Requirements](identity-aware-logging-and-errors-requirements.md)
(FR-ILE-24, FR-ILE-25, Resolved Decisions 10 and 13) and the
[Phase 1 design](design/human-readable-logging-and-errors-phase-1-design.md).
There is no producer-kind field; the writer is identified by service name and
service instance ID, which are always recorded. Server records store the
originating client instance, and a client can export its own session. Affects
§2, R-GOAL-3, R-FR-7, R-FR-8, R-FR-9, R-NFR-6, and adds R-FR-14.  
**Scope:** Client, API server, worker threads, future server processes/nodes, and diagnostic export

## 1. Status of This Document

These requirements are reconstructed from the logging design discussion. They
have not yet been approved as a product specification. The HLD and LLD use them
to make assumptions visible and reviewable instead of silently treating the
current implementation or earlier desktop behavior as authoritative.

## 2. Problem Statement

AudioReach Creator began as a desktop application with one process and one log.
It is now a client-server application that can support multiple clients on one
machine, uses asynchronous APIs and worker threads, and may later run multiple
server processes or nodes.

Before Phase 1 of the logging redesign, the server assigned a new
server-generated `clientId` when a client registered and stored that value as
a log `source`. Phase 1 removes `source` and no longer stores the JWT
`clientId` in logs (R-FR-8, R-FR-9). That identifier can change
after a reconnect or restart, has no durable diagnostic meaning, and cannot
reliably reconstruct work that crosses the client, API server, workers, or
future nodes.

The required outcome is not a literal recreation of one desktop log file. The
required outcome is the same useful support capability: given a user's report,
identify the relevant application activity and inspect the client and server
events that explain what happened.

## 3. Goals

### R-GOAL-1: End-to-end operation correlation

The system shall correlate telemetry produced while handling one user or API
operation across participating components, including the owned UI, API server,
core services, persistence adapters, worker threads, and future remote
services.

### R-GOAL-2: Human-usable incident discovery

Support engineers shall be able to find relevant activity without already
knowing a trace ID. Initial discovery shall support ordinary report details
such as approximate UTC time, project, operation, route, outcome, severity,
service, and client application instance. A discovered event shall expose its
trace ID for expansion to the complete operation.

### R-GOAL-3: Client-launch diagnostic export

The maintained UI shall be able to offer a user action equivalent to “download
logs for this application instance,” covering the period since that UI instance
was launched. This grouping shall not depend on a server-generated connection
identifier. Phase 1 delivers this through the client-instance export
(R-FR-14), which does not depend on tracing.

### R-GOAL-4: Standards-based interoperability

Correlation between networked components shall use OpenTelemetry and W3C Trace
Context conventions where applicable, so clients implemented by other teams or
with other languages can participate without adopting ARC-specific tracing
logic.

### R-GOAL-5: Incremental adoption

The initial implementation shall retain the existing Pino logger and local
`logging.db` where practical. It shall permit later migration to an
OpenTelemetry Collector and a multi-node telemetry backend without changing
core domain APIs.

## 4. Functional Requirements

### R-FR-1: Trace per operation

Each incoming HTTP operation shall execute in a trace context. If a valid
incoming W3C `traceparent` header is present, the server span shall continue
that trace. Otherwise, the server shall create a new root trace.

### R-FR-2: Meaningful spans

The system shall create spans for meaningful units of work, not for individual
log records. Initial span candidates are:

- incoming HTTP request;
- command or query execution;
- important orchestration phases;
- persistence operations where the detail is diagnostically useful;
- outbound HTTP or device operations; and
- worker tasks.

### R-FR-3: Automatic server-log correlation

When a server log is emitted inside an active span, the infrastructure logger
shall add the active `traceId` and `spanId`. Core callers shall not manually
pass tracing identifiers through method parameters.

### R-FR-4: Concurrent request isolation

Two or more asynchronous requests executing concurrently in one Node.js
process shall retain independent trace contexts. A log from one request shall
not be attributed to another request.

### R-FR-5: Explicit boundary propagation

Trace context shall be explicitly propagated over boundaries where in-memory
asynchronous context cannot flow automatically, including HTTP, worker-thread
messages, process boundaries, and future node-to-node communication.

### R-FR-6: Worker correlation

Each worker process or thread shall use its own telemetry runtime and singleton
logger. The parent shall inject trace context into the worker task envelope;
the worker shall extract it and create a child span before executing the task.

### R-FR-7: Client participation

The maintained UI should create a new random UUID for each application launch
and use it as its own `service.instance.id`. It should create or continue
trace context for user operations, and send standard `traceparent` and
optional `tracestate` headers on traced HTTP requests.

External clients may omit tracing. Their requests shall still be traceable from
the server-created root span.

### R-FR-8: Client-instance grouping

When client-launch grouping is required, the maintained UI shall provide its
launch-scoped `service.instance.id` as diagnostic metadata. Because W3C
`traceparent` does not contain client identity, this value shall be transported
separately from trace context, in the `X-ARC-Client-Instance-Id` request
header. It shall not be treated as authentication or authorization data.

Every server log record written while handling such a request shall store the
value as `client_instance_id`. The same UUID is therefore both the UI's own
`service_instance_id` and the `client_instance_id` on server records, so one
value selects both sides of a launch. A missing or invalid header value shall
be ignored and the request shall still succeed.

The client instance groups requests; it does not identify one operation. An
operation is one HTTP request, and per-operation correlation uses the trace ID
(R-FR-1).

### R-FR-9: Structured event fields

Persisted logs shall distinguish at least:

- producer timestamp and server-observed timestamp for remotely submitted logs;
- severity;
- stable event name, represented as `eventName` in application contracts and
  OpenTelemetry `EventName` when exported;
- human-readable description;
- component;
- trace ID and span ID when available;
- producer identity: service name and service instance ID on every record,
  and service version when available. There is no separate producer-kind
  field; server records are selected by the server's service names;
- the originating client instance ID on server records written for a client
  request (R-FR-8);
- project ID when known;
- HTTP route, method, status, and duration for request completion events; and
- structured error details when an error exists.

### R-FR-10: Trace-oriented queries

The diagnostic read model shall support lookup by trace ID and discovery using
time range plus structured metadata. Message substring search may be supported
as a fallback, but shall not be the primary correlation method.

### R-FR-11: Diagnostic bundle

The local application shall support creation of a diagnostic bundle suitable
for a remote user to share. At minimum, the bundle should contain the local
logging database or an equivalent export, relevant spans, service/resource
metadata, and UTC timestamps. Project/domain inputs may be included only when
the user permits it.

### R-FR-12: Existing client-log endpoint transition

The existing client log submission endpoint may remain during migration, but:

- the JWT `clientId` shall not be the durable telemetry identity;
- a submitted log's original trace context shall not be inferred from the HTTP
  request used to upload it;
- client-supplied trace and resource fields shall be validated and treated as
  untrusted diagnostic data; and
- the long-term protocol should be OTLP rather than an expanding proprietary
  log-ingestion contract.

### R-FR-13: Logs outside traces

Startup, shutdown, scheduled, and other background logs may exist without a
trace ID or span ID. The absence of trace context shall not prevent logging.

### R-FR-14: Client-instance log export

A client shall be able to retrieve, with bounded pagination, every record of
one client instance: the records it submitted (`service_instance_id`) and the
server records written for it (`client_instance_id`), across projects, in
timestamp order. The client decides the export file format. Instance IDs
select records but do not grant access (R-ARCH-4). This corresponds to
FR-ILE-25.

## 5. Architecture and Compatibility Requirements

### R-ARCH-1: Core remains platform-neutral

`packages/core` shall not import OpenTelemetry, NestJS, TypeORM, Node.js
`AsyncLocalStorage`, or worker-thread APIs. It shall continue to depend on the
existing logger and other port abstractions.

### R-ARCH-2: No request-scoped logger graph

The API server and each worker shall use a singleton logger. Correlation fields
shall be resolved from the currently active telemetry context when a log call
is made. The dependency-injection graph shall not create one logger per request.

### R-ARCH-3: Stateless HTTP

Trace context and diagnostic client-instance metadata shall accompany each
request that needs them. Server request handling shall not depend on sticky
sessions or in-memory connection ownership.

### R-ARCH-4: Authentication separation

Authentication identity, authorization decisions, client application instance
identity, and trace identity are separate concepts. Neither `traceId` nor
`service.instance.id` shall grant access to logs or other resources.

### R-ARCH-5: Multi-node readiness

No design shall require all server instances or workers to share Node.js memory.
When multiple processes write telemetry, the production design shall avoid
uncoordinated direct writes from all processes to one SQLite file.

### R-ARCH-6: Open-source compatibility

Required observability components shall be usable under licenses compatible
with this BSD-3-Clause project. OpenTelemetry APIs, SDKs, protocols, and the
Collector are acceptable under Apache-2.0.

## 6. Security, Privacy, and Reliability Requirements

### R-NFR-1: Sensitive data

Authorization headers, cookies, tokens, secrets, and unrestricted request or
response bodies shall not be recorded. Structured allowlists and redaction
shall replace blanket payload logging.

### R-NFR-2: Untrusted telemetry

Client-supplied timestamps, service metadata, trace identifiers, log messages,
and errors shall be length-limited and validated. Server-observed time and
authenticated caller information shall remain separately recorded where needed.

### R-NFR-3: Logging failure isolation

A telemetry export or persistence failure shall not normally fail the user
operation. Failures shall be surfaced through bounded fallback diagnostics and
metrics without causing recursive logging.

### R-NFR-4: Bounded overhead

Instrumentation shall avoid a span per log line, unbounded attributes, and
unbounded payload capture. Sampling, retention, and batch export shall be
configurable for future deployments.

### R-NFR-5: Time handling

Timestamps used for cross-component discovery shall be represented in UTC.
Remotely produced telemetry shall retain both producer and receiver times when
clock differences can matter.

### R-NFR-6: Rollout and compatibility

Existing server logging shall keep working while the logging contracts change.
Breaking changes to the client log API (`POST /arc-api/v1/logs`), the log read
APIs, and the logging database schema are allowed: there is no released UI
client yet, so no older client has to be supported (amended 2026-10-31).
Logging database schema changes shall follow the repository's single
regenerated migration workflow.

## 7. Non-Goals

The first adoption does not require:

- a persistent machine-installation identifier;
- a globally meaningful application ID invented by ARC;
- a single total ordering of all distributed log records;
- a span for every function or log statement;
- mandatory OpenTelemetry instrumentation in external clients;
- replacement of Pino;
- deployment of a cloud observability vendor;
- compliance-grade audit logging; or
- immediate removal of the registration endpoint or JWT `clientId` if those are
  still required for non-logging behavior.

## 8. Acceptance Scenarios

### R-AC-1: Two concurrent requests

When requests A and B overlap in the same API process, logs created by core code
while processing A contain A's trace ID, and logs created while processing B
contain B's trace ID.

### R-AC-2: Worker task

When request A dispatches a worker task, the API request span and worker-task
span share one trace ID, have different span IDs, and the worker span identifies
the dispatch span as its parent.

### R-AC-3: External client without tracing

When an external client sends no `traceparent`, the server completes the request
normally and produces a new server-side trace that can be found by time, route,
project, and outcome.

### R-AC-4: Reconnect during one UI launch

When the maintained UI reconnects or obtains a new JWT during the same launch,
its `service.instance.id` remains unchanged and diagnostic export for that
instance still includes activity on both sides of the reconnect.

### R-AC-5: UI restart

When the maintained UI is restarted, it creates a new `service.instance.id`.
The previous launch remains discoverable through its old ID and timestamps; no
persistent installation identifier is required.

### R-AC-6: Remote support

Given a user report containing approximate UTC time, project, and action, a
support engineer can find a matching event, obtain its trace ID, and expand the
trace without searching source code for a generated request identifier.

## 9. Open Product Decisions

These decisions affect rollout and operations but do not change the core
architecture:

- retention duration and maximum diagnostic bundle size;
- whether the first release exports only local SQLite data or also packages a
  local OpenTelemetry Collector;
- authorization policy for diagnostic query/export endpoints;
- exact UI wording and user consent for including project files; and
- the deprecation schedule for `POST /arc-api/v1/logs`.
