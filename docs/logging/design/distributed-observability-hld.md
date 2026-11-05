<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Distributed Observability High-Level Design

**Status:** Proposed  
**Date:** 2026-09-30  
**Audience:** Engineers familiar with desktop applications but new to
client-server tracing  
**Requirements:**
[Distributed Observability Requirements](../distributed-observability-requirements.md)

## 1. Executive Summary

The old desktop application could write one chronological log because one
application process owned the work. The client-server system is different: a
single user action can execute in a UI process, an API server, a worker thread,
a database adapter, and eventually another server node or device. Those
components do not share memory, a clock, a thread, or necessarily a log file.

The proposed design does not try to force distributed work back into one
desktop-style sequence. It uses the industry-standard observability model:

- **logs** explain individual events;
- a **trace** represents one end-to-end operation;
- **spans** represent meaningful parts of that operation;
- **trace context** carries correlation across boundaries; and
- **resource attributes** identify the program instance that produced
  telemetry.

OpenTelemetry supplies the APIs, SDKs, context propagation, and vendor-neutral
export protocol. W3C Trace Context defines the standard `traceparent` and
`tracestate` HTTP headers. The existing Pino logger and local `logging.db` can
remain during the first adoption: server logs are enriched with the currently
active trace and span IDs and persisted as they are today.

The server-generated registration `clientId` is not used as the primary log
identity. It is an authentication or connection concept whose lifecycle is too
short and whose value has no diagnostic meaning. The maintained UI instead
creates a random `service.instance.id` once per application launch. A reconnect
during that launch keeps the same instance ID; restarting the UI creates a new
one.

For remote support, the engineer does not need to know a trace ID beforehand.
They first search structured metadata such as time, project, action, route,
outcome, or client instance. A matching record reveals the trace ID, after
which the complete client-server-worker operation can be expanded.

### 1.1 Relationship to existing logging documents

This is a proposed target architecture. The current Pino and SQLite
implementation, including client identity and log reads, is described in the
Human-Readable Logging and Errors Phase 1 design. If this HLD is approved, its
trace-based correlation decisions build on that design.

The identity-aware logging design addresses how domain entities are described
in messages and issues. That concern is complementary: domain identity helps a
human understand *what* was affected, while trace context identifies *which
operation* the event belongs to.

## 2. Why the Desktop Mental Model No Longer Fits

### 2.1 Earlier desktop model

In a traditional desktop application:

```text
one application process
  ├── UI thread
  ├── background thread
  ├── business logic
  └── one log file
```

All code normally sees the same process memory and logger. Even with multiple
threads, log records arrive at one writer. A timestamp and thread ID often make
the activity understandable.

### 2.2 Current and future model

The same user action can now cross independent execution environments:

```text
UI process
   │ HTTP
   ▼
API process A
   │ worker message
   ▼
Worker thread
   │ database / device / future network call
   ▼
Another component
```

Each environment can have:

- its own memory and logger;
- multiple concurrent operations;
- its own clock and scheduling delays;
- a different process lifetime;
- a different server node; and
- failures that occur before another component receives a message.

A shared identifier such as `clientId` can group records, but it cannot show
which records belong to one operation when the same client starts multiple API
calls concurrently. Sorting all records by timestamp also does not prove causal
order: clocks differ, async tasks overlap, and writes can be buffered.

The useful replacement for “one log file” is therefore not one global sequence.
It is a causal view of each operation plus searchable metadata for finding the
operation.

## 3. Core Concepts in Plain Language

### 3.1 Log

A log is one recorded event, for example:

```text
AWSP parsing started
Database insert completed
Device connection timed out
```

Logs contain detailed messages and structured fields. Logs remain essential;
tracing does not replace them.

### 3.2 Trace

A trace is the complete journey of one operation through the system. Examples:

- the user clicks “Open Project”;
- an external tool submits one API request;
- the UI requests a list of use cases; or
- a scheduled operation performs one import.

Every trace has a random 16-byte **trace ID**, commonly displayed as 32
hexadecimal characters. All participating spans and correlated logs use the
same trace ID.

### 3.3 Span

A span is one timed piece of work inside a trace. A span has:

- a span name, such as `POST /projects/offline/upload-files`;
- a start and end time;
- a unique span ID;
- the ID of its parent span, if it has one;
- a status and optional error;
- structured attributes, such as HTTP route or project ID; and
- optional events.

Spans form a tree:

```text
Trace: user opens a project

UI action: open project                         span A
└── HTTP POST /projects/offline/upload-files    span B
    └── command: OpenFileCommand                span C
        ├── create project                      span D
        └── upload-file orchestration           span E
            ├── ACDB parse                      span F
            ├── AWSP worker task                span G
            └── bulk persistence                span H
```

All spans above have one trace ID. Each span has its own span ID. A span should
represent meaningful work; creating a new span for every log line produces
noise and unnecessary overhead.

### 3.4 Trace context

Trace context is the small piece of metadata that tells the next component
which trace and parent span an operation belongs to. It normally contains:

- trace ID;
- current span ID;
- trace flags, including the sampling decision; and
- optional vendor state.

Trace context is not a logger object, a user session, or shared memory. It is
data carried alongside work.

### 3.5 Resource

A resource describes the program instance that produced telemetry. Typical
OpenTelemetry resource attributes are:

- `service.name`: stable program name, such as
  `audioreach-creator-api` or `audioreach-creator-ui`;
- `service.version`: installed build version; and
- `service.instance.id`: unique ID for this running program instance.

Resource identity answers “which program instance produced this?” Trace
identity answers “which operation did this belong to?” These are separate
questions.

## 4. What `traceparent` Actually Is

`traceparent` is not an ARC invention and it is not one of the original generic
HTTP headers such as `Content-Type`. It is a standard HTTP propagation header
defined by the W3C Trace Context Recommendation and implemented by
OpenTelemetry and many other tracing systems.

An example value is:

```http
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
```

Its fields are:

```text
00                                version
4bf92f3577b34da6a3ce929d0e0e4736  trace ID
00f067aa0ba902b7                  parent span ID
01                                flags; here, sampled
```

The optional `tracestate` header can carry vendor-specific trace state. ARC
should forward it through OpenTelemetry but should not invent uses for it in
the first implementation.

### 4.1 How the client sends it

There is no magic communication between the client and server. The steps are:

1. The client OpenTelemetry SDK starts a span for an operation.
2. Before making an HTTP request, client instrumentation asks the SDK to
   **inject** the current trace context into an HTTP-header carrier.
3. The HTTP library sends those headers over the network like any other
   headers.
4. Server HTTP instrumentation reads, or **extracts**, the headers.
5. The server starts its request span using the extracted span as its parent.

Conceptually, client code would do this:

```typescript
const headers: Record<string, string> = {};
propagation.inject(context.active(), headers);
await httpClient.post(url, body, {headers});
```

In practice, supported OpenTelemetry HTTP or browser instrumentation performs
the injection automatically after being configured. Automatic means library
code adds the headers; it does not mean the server obtains hidden client state.

The server follows the reverse process conceptually:

```typescript
const parentContext = propagation.extract(context.active(), request.headers);
tracer.startActiveSpan('HTTP request', {}, parentContext, async span => {
  await handleRequest();
  span.end();
});
```

Framework instrumentation normally performs this extraction and request-span
lifecycle before NestJS application code runs.

### 4.2 What if the client sends no header?

The server starts a new root trace. The request is still diagnosable on the
server. It simply lacks the client-side part of the journey.

### 4.3 Trust boundary

Trace headers are correlation hints supplied by a caller. They are never proof
of identity or permission. Authentication and authorization continue to use
their own mechanisms. Public deployments should also apply normal OpenTelemetry
limits and may choose to start a new trace at an untrusted boundary while
linking to the incoming context.

## 5. One Operation from UI to Server

Consider two user actions started close together:

```text
Time ─────────────────────────────────────────────────────────────►

UI action A       [client span A──────────────────────────────]
HTTP request A       [server span A────────────────────────]
database A                    [DB span A──────]

UI action B           [client span B──────────────────]
HTTP request B           [server span B────────────]
worker task B                    [worker span B────]
```

Their log records may be interleaved by timestamp. Trace IDs separate the two
causal flows even when they use the same client, project, server, and thread
pool.

For action A:

1. The UI starts trace `TA` and client span `SA1`.
2. It sends `traceparent` containing `TA` and `SA1`.
3. The API creates request span `SA2`, whose parent is `SA1`.
4. Command and persistence spans become children below `SA2`.
5. Logs emitted while those spans are active contain `TA` plus the currently
   active span ID.

Action B follows the same steps with a different trace ID `TB`. Correlation no
longer depends on knowing which connection or thread happened to execute it.

## 6. How a Singleton Logger Knows the Current Request

### 6.1 The apparent problem

NestJS normally injects one singleton logger into many services. If requests A
and B run concurrently, how can the same logger know which request produced a
log from deep inside core code?

It does not infer the request from the log message and it does not store one
global “current request” variable. A normal global variable would be incorrect:
request B could overwrite request A's value.

### 6.2 AsyncLocalStorage mental model

Node.js provides `AsyncLocalStorage`, which behaves like a small private context
slot attached to each asynchronous execution chain.

```text
singleton logger
       │ asks for active context
       ▼
┌─────────────────────────────────────────────┐
│ currently executing asynchronous chain      │
│                                             │
│ request A chain → active span A             │
│ request B chain → active span B             │
└─────────────────────────────────────────────┘
```

When request A enters the server, OpenTelemetry activates span A in request
A's async context. Calls made through ordinary promises, `async`/`await`,
timers, and instrumented I/O retain that context. When request B runs, the same
code sees span B in B's context.

The logger does this at each log call:

```text
1. Ask OpenTelemetry for the active span.
2. If one exists, read its trace ID and span ID.
3. Add those fields to the structured Pino record.
4. Write through the configured transports.
```

Therefore:

- there is one logger instance per process, not one per request;
- core services do not receive trace IDs as parameters;
- concurrent requests remain isolated; and
- logs outside an active trace remain valid but omit trace fields.

OpenTelemetry's Node SDK configures a context manager backed by Node's async
context facilities. Application code should not create a second competing
`AsyncLocalStorage` correlation mechanism unless a non-tracing request context
has a separate demonstrated need.

### 6.3 Where automatic propagation stops

Async context works inside one Node.js process. It does not cross serialization
boundaries:

| Boundary | Context behavior |
|---|---|
| `async`/`await` and promises in one process | normally follows automatically |
| timers and normal instrumented I/O | normally follows automatically |
| HTTP request | inject/extract headers |
| worker-thread message | inject/extract fields in message envelope |
| child process or another server node | inject/extract through IPC or network |
| device protocol | protocol-specific propagation or trace link |

## 7. Worker Threads and Future Processes

A worker thread has a separate JavaScript runtime. It does not inherit the
parent's active OpenTelemetry context or singleton logger.

The parent process therefore:

1. starts a span for dispatching or executing the worker task;
2. injects trace context into a serializable carrier;
3. includes that carrier in the worker message; and
4. posts the task.

The worker:

1. initializes its own OpenTelemetry SDK and singleton logger;
2. extracts the carrier from the task message;
3. creates a worker span whose parent is the propagated context;
4. runs the registered handler while that span is active;
5. logs normally; and
6. records success or error and ends the span.

Conceptual task envelope:

```typescript
interface WorkerMessage<TTask> {
  task: TTask;
  telemetry?: {
    traceparent?: string;
    tracestate?: string;
  };
}
```

The same model extends to future server nodes. The transport differs, but the
rule remains: inject before sending, extract after receiving, create a child
span around the received work.

## 8. Client Identity: The Minimum Useful Model

### 8.1 Selected fields

The maintained UI needs only the following resource identity for telemetry:

| Field | Lifetime | Example | Purpose |
|---|---|---|---|
| `service.name` | stable for the product/component | `audioreach-creator-ui` | identifies which software emitted telemetry |
| `service.version` | one build/version | `1.8.0` | distinguishes behavior between releases |
| `service.instance.id` | one running UI instance | random UUID | groups activity since this UI was opened |

The API server and each worker process/thread also publish their own resource
identity. A server instance must never copy the client's resource identity and
claim it as its own.

### 8.2 Why there is no persistent installation ID initially

A persistent installation ID answers “is this the same installation across
multiple launches?” That is not required for downloading diagnostics for the
current launch, and it introduces persistence, reset, privacy, cloning, and
support-policy questions. It should be added only if a concrete cross-restart
use case is approved later.

### 8.3 Why the existing `clientId` is different

The current server-generated `clientId` is issued during registration and put
in a JWT. It may still be useful for the current authentication/registration
contract, but it is not a durable telemetry identity and is not an operation
correlation ID.

The five identifiers answer different questions:

| Identifier | Question answered |
|---|---|
| authenticated subject/client ID | who is permitted to call? |
| client name (`client.name`) | which kind of client is calling, for example `audioreach-creator-ui`? |
| `service.instance.id` | which running program produced this? |
| trace ID | which end-to-end operation is this? |
| span ID | which part of that operation is this? |

### 8.4 How the server learns the client instance ID

`traceparent` does not contain `service.instance.id`. OpenTelemetry resources
describe the producer's telemetry and are not automatically copied to the next
service.

If server-side logs must be searchable by the originating UI launch, the UI
must send that value separately, for example in an ARC application header:

```http
X-ARC-Client-Instance-Id: 6aa7bf9e-2d6f-4df7-b87b-9812a493bc52
```

This custom header is diagnostic metadata, whereas `traceparent` is the
standard correlation header. The API validates the value, records it as an
originating-client attribute on its spans/logs, and never uses it to authorize
the request. External clients are not required to send it.

If the owned UI exports its telemetry directly through OTLP, its own log and
span records already carry `service.instance.id`; the custom header is needed
only to make server records independently searchable by the originating UI
instance.

The client name needs no header. In phase 1 the client registers its name
once; the name is signed into its access token, and the API reads it from
there for every request (Human-Readable Logging Phase 1 design §6.2). A
client cannot use the API's own service name.

## 9. Logging and Tracing Responsibilities

### 9.1 Core

Core continues to emit domain and application logs through the existing
`Logger` port. It can supply stable business metadata it genuinely knows, such
as action, component, project, and domain identifiers. It does not import
OpenTelemetry and does not pass `traceId` or `spanId` through command handlers.

### 9.2 API and infrastructure

The outer layers own:

- OpenTelemetry SDK startup and shutdown;
- HTTP instrumentation and propagation;
- active-context lookup;
- Pino enrichment;
- framework, persistence, and worker spans;
- telemetry export and storage; and
- diagnostic APIs.

### 9.3 Logs versus spans

Use a span for duration, hierarchy, status, and cross-boundary causality. Use a
log for detailed events and explanations.

```text
Span: bulk import (2.3 seconds, failed)
  Log: parsed 418 module definitions
  Log: skipped malformed record at offset 10240
  Log: transaction rollback failed: database busy
```

One span for the entire server lifetime is not useful. One span per log line is
also not useful. The correct level is a meaningful operation or phase.

## 10. Client Logs: Separate Storage or One Combined Log?

### 10.1 Decision

Client and server telemetry should be produced independently with honest
resource identity, then correlated through trace context and searchable
metadata. They may appear together in one diagnostic viewer or export, but the
server must not rewrite all client events as if the server produced them.

### 10.2 Maintained UI

The preferred long-term design is for the UI to use OpenTelemetry and export
logs/spans through OTLP to an approved local collector or ingestion boundary.
This preserves the original trace and resource fields.

During migration, the existing `POST /arc-api/v1/logs` endpoint may remain. A
submitted log must carry its original telemetry context explicitly. The span of
the upload HTTP request describes “upload this log”; it is not automatically
the span in which the original client event occurred.

### 10.3 External clients

External clients are not required to submit their internal logs. At minimum,
they can send standard trace headers and retain their own telemetry. If they
send nothing, server-side tracing still works. If cross-organization diagnosis
is needed, both sides can exchange a trace ID and time window without sharing
an ARC-specific client logging implementation.

An MCP server, AI agent, script, or third-party UI is treated the same way as
any other external client. The protocol boundary is HTTP trace propagation;
ARC does not need client-language-specific logging code or knowledge of the
agent's internal execution model.

## 11. Storage and Deployment Evolution

### 11.1 Phase 1: local, single API process

```text
API + core logs ──Pino──► logging.db
      │
      └──OpenTelemetry spans──► local exporter/storage
```

Keep Pino and SQLite. Add trace fields to the log schema and correlate them
with spans. This is the smallest useful migration.

### 11.2 Phase 2: workers

```text
API logger ───────┐
worker telemetry ─┼──► one safe telemetry ingestion/writer boundary
worker telemetry ─┘
```

SQLite permits multiple connections but serializes writes and can become a
contention point. Worker threads should not independently open uncontrolled
writers to the same database. Prefer sending worker telemetry to the parent or
to a collector/export pipeline that owns batching and backpressure.

### 11.3 Phase 3: multiple nodes

```text
UI / API node A / API node B / workers
                 │ OTLP
                 ▼
        OpenTelemetry Collector
          ├── trace backend
          └── log backend
```

The Collector is a vendor-neutral telemetry pipeline, not the database itself.
It can receive OTLP, batch and process telemetry, and export it to an
open-source or commercial backend. The deployment can choose Tempo, Jaeger,
Loki, OpenSearch, or another supported system later. Application code remains
based on OpenTelemetry and does not depend on that choice.

For a local desktop distribution, the collector may be embedded in the
packaging only when the operational benefit justifies another process. The HLD
does not require it for the first release.

## 12. Finding Logs Without Knowing a Trace ID

A trace ID is an expansion key, not the only discovery key.

Recommended support workflow:

```text
User report
  │ approximate UTC time, project, action, error, UI instance
  ▼
Search structured diagnostic records
  │ find one matching request/log/span
  ▼
Read trace ID from that record
  ▼
Expand all spans and correlated logs in the trace
  ▼
Inspect neighboring instance/project events if needed
```

Useful discovery fields are:

- UTC time range;
- stable event/action name;
- project ID or natural project identifier;
- HTTP route and status;
- error code or severity;
- `service.name` and `service.version`;
- originating client `service.instance.id`; and
- producer kind or server instance.

Searching the human message text remains useful for unusual errors, but it is
fragile: wording changes, values vary, and localization may be added later.

## 13. Diagnostic Bundle

For a remote user, the product should expose a guided export rather than ask
the user to locate trace IDs manually. A bundle should include:

- `logging.db` or a filtered portable representation;
- trace/span data for the selected UI instance or time range;
- client, server, and worker resource metadata;
- application versions and UTC time range;
- configuration that is safe and relevant to diagnosis; and
- optionally, project/database/input files with explicit user consent.

The manifest should state which files were included, export time, time zone,
application versions, and any redactions. The bundle must not silently include
tokens, unrestricted environment variables, credentials, or private project
content.

## 14. Security and Privacy

The current middleware records most headers and request/response bodies after
limited redaction. That becomes riskier when external clients, AI tools, and
additional APIs are supported.

The target policy is:

- record route templates, methods, statuses, durations, sizes, and approved
  business identifiers;
- do not record authorization, cookie, token, or secret values;
- do not record arbitrary bodies by default;
- validate and length-limit all client-submitted telemetry;
- retain server-observed timestamps separately from client timestamps;
- never use trace or instance identifiers as authorization secrets;
- configure retention and maximum storage size; and
- ensure exporter failure does not recursively generate unlimited logs.

W3C trace IDs are random correlation values, but they can still reveal
relationships between operations. Diagnostic access must therefore use normal
authorization and data-handling controls.

## 15. Options Considered

### Option A: Continue grouping by server-generated `clientId`

Rejected as the primary design. It changes on registration/reconnect, cannot
separate concurrent operations, does not propagate naturally to workers or
future nodes, and mixes authentication with observability.

### Option B: Recreate one global ordered log

Rejected. A strict total order across independent clocks, processes, buffers,
and nodes is expensive and still does not express parent-child causality. A
time-sorted view can be offered as a presentation, but trace structure is the
source of operation correlation.

### Option C: Add only a custom request ID

Rejected as the target architecture. A request ID is useful inside one server
request but lacks standard parent/child propagation and tooling across clients,
workers, services, and languages. It may remain as a friendly display field if
derived separately, but it must not replace trace context.

### Option D: Pass trace IDs through every core method

Rejected. It pollutes domain/application APIs with infrastructure concerns,
invites missing or incorrect propagation, and violates the package boundary.
The active context and logger adapter solve this at the infrastructure edge.

### Option E: OpenTelemetry correlation with structured logs

Selected. It is standard, language-neutral, incremental, compatible with the
existing logger, and suitable for worker and multi-node evolution.

## 16. Consequences and Trade-offs

Benefits:

- concurrency-safe operation correlation;
- interoperability with external clients and future services;
- no OpenTelemetry dependency in core;
- useful local diagnostics without requiring a cloud service;
- a path from one process to workers and multiple nodes; and
- support discovery that does not depend on a known trace ID.

Costs:

- SDK initialization and lifecycle management in each runtime;
- schema and query changes;
- propagation code at worker and other non-HTTP boundaries;
- instrumentation tests;
- storage, sampling, retention, and privacy policy decisions; and
- incomplete client-to-server traces until clients adopt propagation.

## 17. Recommended Adoption Order

1. Add server HTTP tracing and active-context log enrichment.
2. Persist trace/resource/request discovery fields in `logging.db`.
3. Add trace and discovery queries plus a diagnostic export format.
4. Instrument command/query execution at the API composition boundary.
5. Propagate trace context through worker messages and initialize worker
   telemetry independently.
6. Instrument the maintained UI and add its launch-scoped
   `service.instance.id`.
7. Transition client logs from the proprietary endpoint toward OTLP.
8. Introduce a Collector and multi-node backend only when deployment topology
   requires it.

Each step provides value independently and keeps the application operational
if later steps are deferred.

## 18. Standards and References

- [W3C Trace Context Recommendation](https://www.w3.org/TR/trace-context/)
- [OpenTelemetry specification](https://opentelemetry.io/docs/specs/otel/)
- [OpenTelemetry context propagation](https://opentelemetry.io/docs/concepts/context-propagation/)
- [OpenTelemetry resources](https://opentelemetry.io/docs/concepts/resources/)
- [OpenTelemetry Protocol (OTLP)](https://opentelemetry.io/docs/specs/otlp/)
- [OpenTelemetry Collector](https://opentelemetry.io/docs/collector/)
- [Node.js `AsyncLocalStorage`](https://nodejs.org/api/async_context.html#class-asynclocalstorage)

## 19. Glossary

| Term | Meaning |
|---|---|
| correlation | associating telemetry that belongs to the same operation |
| context | metadata associated with the currently executing async operation |
| exporter | component that sends telemetry to a destination |
| instrumentation | code or library hooks that create telemetry |
| log | one event with severity, message, and fields |
| OTLP | OpenTelemetry's standard telemetry transport protocol |
| resource | identity of the program instance producing telemetry |
| span | one timed operation inside a trace |
| trace | end-to-end tree of work for one operation |
| `traceparent` | standard W3C header carrying trace and parent-span identity |
| `tracestate` | optional standard W3C header carrying vendor trace state |
