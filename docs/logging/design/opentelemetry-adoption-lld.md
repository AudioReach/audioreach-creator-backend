<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# OpenTelemetry Adoption Low-Level Design

**Status:** Proposed  
**Date:** 2026-09-30  
**High-level design:**
[Distributed Observability HLD](./distributed-observability-hld.md)  
**Requirements:**
[Distributed Observability Requirements](../distributed-observability-requirements.md)

## 1. Purpose

This document maps the distributed observability design to the current
AudioReach Creator Backend. It defines package ownership, runtime behavior,
data contracts, schema evolution, endpoint evolution, worker propagation, and
verification strategy.

It is an LLD, not approval to implement every phase at once. The recommended
first delivery is server HTTP tracing, automatic Pino correlation, SQLite
storage, trace queries, and worker propagation. UI OTLP export and a Collector
can follow independently.

## 2. Architecture Constraints

The implementation shall preserve the repository's architecture:

```text
packages/api                       NestJS composition and HTTP boundaries
       │
       ▼
packages/core                      domain/application and abstract ports
       ▲
       │
packages/infrastructure/logger     Pino, OpenTelemetry, SQLite telemetry
packages/infrastructure/fs         worker-thread propagation/runtime
```

Rules:

- `packages/core` must not import OpenTelemetry, Node.js,
  `AsyncLocalStorage`, NestJS, or TypeORM.
- Core log call sites must not pass `traceId` or `spanId`.
- One singleton logger is used per JavaScript runtime: API process and each
  worker thread.
- HTTP remains stateless. Every request carries any needed propagation and
  client-instance metadata.
- TypeScript ESM imports must include `.js`.
- Commands and queries continue through the existing CQRS buses.
- Logging schema changes use the single regenerated logging migration workflow
  in `AGENTS.md`.

## 3. Current Implementation Assessment

Sections 3.1 and 3.2 describe the code before the [Human-Readable Logging and Errors Phase 1 design](./human-readable-logging-and-errors-phase-1-design.md). That phase removes
`source`, adds `service_name`, `service_instance_id`, `client_name`, and
`client_instance_id`, and replaces the project-log filter (its §6.2, §7, §10, and §11). Later
sections of this LLD build on that state.

### 3.1 Existing flow

The current flow is:

```text
client registers
  └── AuthenticationService generates UUID clientId
      └── JWT contains clientId

client submits POST /arc-api/v1/logs
  └── LogController sets source = authenticated clientId
      └── PinoLogService
          └── PinoSQLiteTransport
              └── logging.db / log_entries

client reads GET /arc-api/v1/projects/:projectId/logs
  └── GetLogsByProjectQuery
      └── DbLogQueryService filters source = clientId
```

Server logs normally default `source` to `Server`. Consequently, the current
read query that requires `source = clientId` excludes ordinary server records
instead of reconstructing client-server activity.

### 3.2 Current request correlation

`RequestLoggerMiddleware` generates a 12-character request ID, embeds it in
`tag`, and manually decodes the JWT to derive a log source. This provides local
request grouping for middleware records only. Deep logs use the same tag only
if a caller manually passes it, and the value cannot establish parent-child
relationships across workers, processes, or external clients.

The middleware also captures broad header and body content. The target design
removes blanket payload logging in favor of approved structured attributes.

### 3.3 Existing seams that can be reused

The following existing abstractions are suitable:

- `Logger` in `packages/core/src/shared/types/logger.interface.ts` remains the
  core logging port.
- `PinoLogService` remains the server logger adapter.
- `PinoSQLiteTransport` and `logging.db` remain the initial local log sink.
- `LogQueryService` remains the log read contract, although its methods and
  read model need expansion. Phase 1 moved it from core to `@arc/logger`; the
  API calls it directly, not through the query bus (phase 1 design decision
  26).
- `CommandBus`, `QueryBus`, and handler factories remain unchanged in core.
- `NodeWorkerPoolAdapter` remains responsible for crossing the worker boundary.

## 4. Target Runtime Components

```text
┌──────────────────────────────── API process ────────────────────────────────┐
│ Node OpenTelemetry SDK                                                     │
│   ├── AsyncLocalStorage context manager                                    │
│   ├── W3C Trace Context propagator                                         │
│   ├── HTTP instrumentation                                                 │
│   └── batch span processor → SQLite span exporter / OTLP exporter          │
│                                                                            │
│ Nest HTTP span                                                             │
│   └── traced CommandBus/QueryBus decorator                                 │
│       └── existing core bus and handlers                                   │
│                                                                            │
│ singleton PinoLogService                                                   │
│   └── reads active span on every call                                      │
│       └── Pino SQLite transport → one serialized logging.db writer         │
└───────────────────────────────┬────────────────────────────────────────────┘
                                │ worker envelope + W3C carrier
┌───────────────────────────────▼────────────────────────────────────────────┐
│ Worker thread                                                              │
│ worker-local OpenTelemetry SDK + worker-local singleton logger             │
│   └── extracts parent → starts worker span → executes registered handler   │
│       └── sends structured telemetry through dedicated parent channel      │
└────────────────────────────────────────────────────────────────────────────┘
```

When an OTLP Collector is configured later, the API and workers export to it
instead of sharing a SQLite writer across processes or nodes.

## 5. Package and Dependency Placement

### 5.1 `packages/infrastructure/logger`

This package owns Node observability implementation because it already owns
Pino and logging persistence. Add compatible, lockfile-pinned OpenTelemetry
packages for:

- `@opentelemetry/api`;
- Node SDK and resources;
- W3C propagation and async context support supplied by the SDK;
- HTTP instrumentation;
- semantic conventions;
- OTLP trace export when enabled; and
- SDK types needed by a local SQLite span exporter.

Exact versions shall be selected together from the supported OpenTelemetry JS
release line; mixing arbitrary API, SDK, and instrumentation versions is not
allowed.

New public infrastructure services:

```text
packages/infrastructure/logger/src/telemetry/
  telemetry-runtime.ts
  telemetry-config.ts
  log-producer-identity.ts
  active-log-context.provider.ts
  sqlite-span-exporter.ts
  worker-telemetry-transport.ts
```

Names may be adjusted during implementation, but ownership shall remain in an
outer infrastructure package.

### 5.2 `packages/api`

The API package owns:

- starting telemetry before NestJS and instrumented libraries are loaded;
- stopping/flushing telemetry during shutdown;
- HTTP request attributes and safe request-completion logs;
- application-layer command/query tracing decorators;
- diagnostic controller DTOs and authorization; and
- environment-driven telemetry configuration.

### 5.3 `packages/infrastructure/fs`

The file-system package owns trace injection into worker messages and extraction
in `generic.worker.ts`. It may depend on the public worker bootstrap/export
utilities from `@arc/logger`, but shall not expose OpenTelemetry types through
the core `WorkerPoolPort`.

### 5.4 `packages/core`

The core `Logger` and `LogData` write contract established by the Human-Readable
Logging and Errors Phase 1 design should remain unchanged during OpenTelemetry
adoption. Trace and remaining resource data are appended by the infrastructure
adapter. The service name, service instance, and client instance already exist
from that phase.

The `@arc/logger` log read models may expose trace IDs and resource fields as
plain strings because the API must return them. They must not import or expose
OpenTelemetry SDK types.

## 6. Telemetry Bootstrap and Shutdown

### 6.1 Initialization order

OpenTelemetry must initialize before modules such as HTTP clients and servers
are loaded if their instrumentation patches module behavior. Static ESM import
evaluation makes “call setup near the top of the existing `main.ts`” unreliable
when `main.ts` has already imported NestJS and `AppModule`.

Refactor the entry into two stages:

```text
packages/api/src/main.ts                 minimal entrypoint
packages/api/src/application-bootstrap.ts  existing Nest bootstrap body
```

Conceptual `main.ts`:

```typescript
import {startTelemetry} from '@arc/logger';

const telemetry = await startTelemetry(loadTelemetryConfig());

try {
  const {bootstrapApplication} = await import('./application-bootstrap.js');
  await bootstrapApplication(telemetry);
} catch (error) {
  await telemetry.shutdown();
  throw error;
}
```

The dynamic import occurs after SDK startup. An alternative Node `--import`
bootstrap is acceptable if it works consistently for development, production,
tests, and Swagger generation.

### 6.2 Resource construction

API resource attributes:

```text
service.name        = audioreach-creator-api
service.version     = package/build version
service.instance.id = UUID generated once at process startup
service.namespace   = audioreach-creator       optional
deployment.environment.name = development/test/production
```

Worker resource attributes:

```text
service.name        = audioreach-creator-worker
service.version     = same application build version
service.instance.id = UUID generated once in that worker runtime
worker.label        = existing worker-0, worker-1, ...
process.pid         = runtime metadata when safe
```

The worker label is useful to humans but is not a globally unique instance ID.

### 6.3 Shutdown

The current application already flushes `SQLiteTransport` in Swagger
generation before closing the Nest application. Normal application shutdown
shall similarly:

1. stop accepting new work;
2. dispose the worker pool;
3. flush Pino transports;
4. force-flush and shut down the OpenTelemetry SDK; and
5. close telemetry and application data sources.

Shutdown must be bounded by a configurable timeout.

## 7. HTTP Request Instrumentation

### 7.1 Server span creation

Use OpenTelemetry Node HTTP instrumentation to extract standard W3C
`traceparent`/`tracestate` headers and create the HTTP server span. The
instrumentation shall run before `RequestLoggerMiddleware`, making the server
span active when middleware, controllers, CQRS, and adapters execute.

If the incoming header is absent or invalid, instrumentation creates a new root
trace. Invalid trace context must not reject an otherwise valid API request.

### 7.2 Request middleware revision

Revise:

`packages/api/src/infrastructure-wrapper/middleware/request-logger.middleware.ts`

Required changes:

- stop using the generated 12-character request ID as primary correlation;
- keep the phase 1 split of the request log context: the middleware opens
  it with the client instance ID, and `ProjectLogContextGuard` and
  `JwtStrategy` add the route's project ID and the verified client name
  through `ActiveLogContextProvider.enrich` (§8.1); none of them decodes the
  token or parses the URL;
- obtain trace/span correlation indirectly through the singleton logger;
- use `res.on('finish')`/`res.on('close')` rather than replacing `res.send`;
- emit stable events `http.request.started` and `http.request.completed`;
- add method, route template, status, and duration as structured attributes;
- keep the phase 1 validation of optional `X-ARC-Client-Instance-Id`, and move
  the value from the phase 1 `AsyncLocalStorage` log context into the
  OpenTelemetry context and the active server span as `client.instance.id`;
- do not record arbitrary request/response bodies; and
- use allowlisted headers only.

A friendly `requestId` can remain if users need a short value in screenshots,
but it is additional display metadata, not the distributed correlation key.

### 7.3 Route template timing

The raw URL may contain identifiers and high-cardinality data. Prefer the Nest
route template, such as `/projects/:projectId/logs`, when it is available. If
middleware runs before route resolution, an interceptor can attach final route
and outcome attributes on completion.

### 7.4 Trace ID response

For support usability, the API may return:

```http
X-Trace-Id: 4bf92f3577b34da6a3ce929d0e0e4736
```

This is an ARC convenience header, not W3C propagation. If enabled, CORS must
expose it to the maintained UI. It carries no authorization meaning.

## 8. Singleton Logger Enrichment

### 8.1 Context provider

Add a small infrastructure-only abstraction to make context lookup testable:

```typescript
export interface ActiveLogContext {
  traceId?: string;
  spanId?: string;
  traceFlags?: number;
  clientName?: string;
  clientInstanceId?: string;
  projectId?: string;
}

export interface ActiveLogContextProvider {
  current(): ActiveLogContext;
  run<T>(context: ActiveLogContext, fn: () => T): T;
  enrich(values: ActiveLogContext): void;
}
```

`run` and `enrich` come from phase 1 of the human-readable logging design
(§6.2, decision 29). `enrich` adds values that a later request stage learns
(the route's project ID, the verified client name) to the context of the
innermost active `run`, so that records written afterwards by any code of
that run, including the exception filters and the response log, carry
them.

`OpenTelemetryActiveLogContextProvider` reads:

```typescript
const span = trace.getSpan(context.active());
const spanContext = span?.spanContext();
```

The public OpenTelemetry `Span` API does not provide a general attribute reader.
For request-specific values that the logger must also read, such as originating
client instance, define a private OpenTelemetry context key with
`createContextKey()`. The HTTP boundary validates the header, sets the value on
the current context, and invokes the remainder of the request inside
`context.with(...)`. The logger reads the same key from `context.active()`.
This reuses the configured OpenTelemetry context manager instead of introducing
a second `AsyncLocalStorage` store. Phase 1 of the human-readable logging
design already defines this port with an `AsyncLocalStorage` implementation
that carries `clientName`, `clientInstanceId`, and the route's `projectId`;
this LLD replaces that implementation and deletes it.

OpenTelemetry contexts are immutable: `context.with()` scopes a new context
to a callback and cannot change the context of code already running. So
`run` stores one mutable slot under the private key, `enrich` replaces the
frozen value in that slot, and `current()` reads it, which is the shape of
the phase 1 implementation. Trace and span IDs are still read from the
active span, not from the slot.

### 8.2 `PinoLogService`

Revise:

`packages/infrastructure/logger/src/pino-log.service.ts`

`withDefaults()` builds an infrastructure record from:

1. caller-provided `LogData`;
2. producer timestamp default;
3. server-observed timestamp;
4. process resource attributes; and
5. the current trace/span context.

Conceptual behavior:

```typescript
private withDefaults(data: LogData): ServerLogRecord {
  const active = this.contextProvider.current();
  return {
    ...data,
    timestamp: data.timestamp,
    observedTimestamp: new Date(),
    traceId: active.traceId,
    spanId: active.spanId,
    serviceName: this.producer.serviceName,
    serviceVersion: this.producer.serviceVersion,
    serviceInstanceId: this.producer.serviceInstanceId,
    clientName: active.clientName,
    clientInstanceId: active.clientInstanceId,
    projectId: data.projectId ?? active.projectId,
  };
}
```

This path handles server-generated core logs. Client-submitted logs use the
phase 1 `ClientLogWriter`, which carries the client's resource identity and
does not go through core `LogData`.

The core caller still writes:

```typescript
logger.logInfo({
  eventName: 'command.execution.succeeded',
  description: 'OpenFileCommand completed',
  component: 'CommandBus',
  tag: 'command-execution',
  timestamp: new Date(),
});
```

No request logger is constructed and no trace argument is added.

### 8.3 Event naming

The core `eventName` field maps directly to OpenTelemetry `EventName`. Event
names use stable, low-cardinality, dot-separated names such as
`command.execution.succeeded`; they never contain IDs, names, or other values
that vary per occurrence. Human-variable content belongs in `description` or
structured attributes.

Pino's `msg` field is a transport-level display message populated from
`description`; it is not the canonical event identifier. Since phase 1, no API
contract or column uses `msg`.

### 8.4 Error handling

`AllExceptionsFilter` and `ValidationExceptionFilter` continue logging through
the singleton logger. The API layer additionally records the exception on the
active span and sets span status to error for unexpected/server failures.
Expected 4xx domain outcomes may use an error/status attribute without marking
the trace as an infrastructure failure, based on an explicit mapping.

## 9. Command and Query Spans Without Polluting Core

### 9.1 Selected design: API-layer decorators

Do not add OpenTelemetry to `CommandBus` or `QueryBus` in core. Add delegation
wrappers in the API composition layer:

```text
packages/api/src/infrastructure-wrapper/telemetry/
  traced-command-bus.ts
  traced-query-bus.ts
```

Each wrapper exposes the same `execute` shape, starts an active span, invokes
the existing core bus, records outcome/error, and ends the span in `finally`.

Conceptual command wrapper:

```typescript
async execute<T>(command: BaseCommand, session?: ActiveSession): Promise<T> {
  const name = `command ${command.constructor.name}`;
  return await this.tracer.startActiveSpan(name, async span => {
    try {
      const result = await this.delegate.execute<T>(command, session);
      span.setStatus({code: SpanStatusCode.OK});
      return result;
    } catch (error) {
      recordSpanError(span, error);
      throw error;
    } finally {
      span.end();
    }
  });
}
```

The wrappers are registered in
`packages/api/src/infrastructure-wrapper/arc-cqrs.module.ts`. Preserve the
existing injectable contract seen by controllers while keeping a separate
private token for the unwrapped core bus to avoid recursive injection.

### 9.2 Span attributes

Low-cardinality attributes:

```text
arc.cqrs.kind = command | query
arc.cqrs.name = OpenFileCommand
arc.session.mode = ...               when already available and safe
arc.project.id = ...                 when explicitly available
```

Do not serialize entire command/query objects into spans.

### 9.3 Deeper phases

Do not create a generic tracing dependency in every core service initially.
The HTTP and command/query spans already correlate existing core logs.

For a proven need to time specific phases, choose one of these boundaries:

- instrument an outer adapter call;
- wrap an existing core port implementation; or
- add a small platform-neutral `ProfilerPort` implementation that emits spans,
  where the existing profiler semantics match the operation.

Adding a new generic tracing port to core requires a separate architecture
decision and is not part of the baseline.

## 10. Worker Propagation and Worker-Local Logging

### 10.1 Do not change the core task contract

Keep `WorkerTask<TInput, TContext>` in core free of OpenTelemetry fields.
`NodeWorkerPoolAdapter` wraps it at the infrastructure boundary:

```typescript
interface NodeWorkerTaskEnvelope<TInput, TContext> {
  kind: 'task';
  task: WorkerTask<TInput, TContext>;
  propagation: Record<string, string>;
  diagnostics?: {
    clientInstanceId?: string;
  };
}
```

Before `worker.postMessage`, use the configured OpenTelemetry propagator to
inject the current context into `propagation`. The carrier normally contains
`traceparent` and optionally `tracestate`. Copy the already validated client
instance value separately into `diagnostics`; W3C Trace Context does not carry
it. The worker sets both the extracted trace context and this diagnostic value
as active while executing the task.

### 10.2 Worker bootstrap

Revise:

- `packages/infrastructure/fs/src/workers/node-worker-pool.adapter.ts`
- `packages/infrastructure/fs/src/workers/generic.worker.ts`
- `packages/infrastructure/fs/src/workers/worker-pool.factory.ts`
- `packages/infrastructure/fs/src/workers/node-worker-pool-singleton.adapter.ts`

Each worker initializes once:

- one worker-local telemetry SDK/context manager;
- one worker resource;
- one worker-local singleton Pino logger; and
- one dedicated telemetry channel to the parent or an OTLP exporter.

For each task, the worker extracts the envelope context and starts an active
span named `worker <handlerKey>`. All handler logs then receive the worker span
context automatically.

### 10.3 Message protocol

Do not multiplex telemetry and task results through the existing untyped
single-result assumption. Use discriminated messages or a dedicated
`MessagePort`:

```typescript
type WorkerControlMessage<T> =
  | {kind: 'result'; result: WorkerResult<T>}
  | {kind: 'telemetry'; record: SerializedTelemetryRecord}
  | {kind: 'ready'};
```

A dedicated port is preferred because `NodeWorkerPoolAdapter` currently waits
for one `message` as the task result. It prevents a log message from being
mistaken for task completion.

### 10.4 SQLite writer ownership

For the local SQLite phase, worker log/span records are sent to the API process,
which owns one bounded, serialized write path to `logging.db`. Workers do not
open independent TypeORM data sources to the same logging file.

When an OTLP Collector is deployed, workers may export directly to it in
batches, and the parent-channel compatibility path can be disabled.

### 10.5 Worker failures

Parent-side lifecycle errors that happen before worker context extraction are
logged in the parent's active dispatch span when possible. Worker-side handler
errors are recorded in the worker span and returned in the existing
`WorkerResult` error representation. The parent shall not rewrite worker
resource identity when persisting forwarded records.

## 11. Maintained UI and External Client Contract

### 11.1 Maintained UI launch

At startup, the UI creates:

```text
service.name        = audioreach-creator-ui
service.version     = UI build version
service.instance.id = random UUID for this launch
```

The value is held for the application lifetime and reused after HTTP reconnects
or token renewal. It is not persisted across a full application restart.

### 11.2 HTTP headers

For traced calls, the UI sends:

```http
traceparent: <W3C value generated/injected by OpenTelemetry>
tracestate: <optional W3C value>
X-ARC-Client-Instance-Id: <UI service.instance.id>
```

Only the last header is ARC-specific. The UI should not manually construct
`traceparent`; it should let the SDK propagator inject it.

### 11.3 Registration `clientId`

Do not use the registration UUID as log source/correlation. Retain it only while
the authentication or connection contract needs it. Replacing the current
registration security model is outside this LLD.

### 11.4 External clients

External clients have three supported participation levels:

1. No tracing headers: server creates a root trace.
2. W3C `traceparent`: server continues the caller's trace.
3. Full OpenTelemetry/OTLP: client and server telemetry can be viewed together.

`X-ARC-Client-Instance-Id` is optional for external clients, except on
`POST /arc-api/v1/logs`, which requires it (§11.5).

### 11.5 Transitional client-log ingestion

Keep `POST /arc-api/v1/logs` only as a compatibility endpoint during migration.
Phase 1 already requires `eventName` and the `X-ARC-Client-Instance-Id`
header, and takes the launch from that header and the client name from the
access token; neither is a body field.
Extend its DTO with optional, validated fields:

```typescript
interface ClientLogContextDto {
  traceId?: string;             // 32 lowercase hex characters
  spanId?: string;              // 16 lowercase hex characters
  serviceVersion?: string;
}
```

The endpoint records:

- client producer timestamp from the DTO;
- server-observed timestamp at receipt;
- authenticated subject separately if required for audit/security;
- client resource identity as the producer;
- original client trace/span IDs from the DTO; and
- the upload request's trace only as ingestion metadata, if retained.

It must not overwrite the original client event's trace ID with the trace ID of
the POST used to upload the record.

Preferred end state: the UI exports OpenTelemetry logs/spans through OTLP, and
the custom endpoint is deprecated rather than continuously expanded.

## 12. Logging Database Design

### 12.1 `log_entries` evolution

Phase 1 of the human-readable logging design already renamed `msg` to
`event_name`, dropped `source`, and added `service_name`,
`service_instance_id`, `client_name`, and `client_instance_id` with their
indexes. This LLD
adds:

| Column | Type | Null | Purpose |
|---|---|---:|---|
| `observed_timestamp` | datetime/text | no | time the receiving runtime observed the record |
| `trace_id` | varchar(32) | yes | operation correlation |
| `span_id` | varchar(16) | yes | emitting operation within the trace |
| `service_version` | text | yes | producer build |
| `attributes` | text | yes | bounded JSON object for approved structured fields |

There is no `producer_kind` column. The producer is identified by the standard
`service_name` and `service_instance_id`; server records are selected by the
server's own service names.

Existing semantic adjustments:

- `timestamp` means producer/event time.
- `event_name` stores the stable event name and maps to application
  `eventName` and OpenTelemetry `EventName`.
- `description` remains human-readable text and maps to the OpenTelemetry body
  and Pino `msg`.

Required indexes:

```text
(trace_id, observed_timestamp)
(client_instance_id, observed_timestamp)
(project_id, observed_timestamp)
(event_name, observed_timestamp)
(service_name, service_instance_id, observed_timestamp)
```

Indexes shall be confirmed using representative query plans and data volume;
redundant indexes should be removed before release.

### 12.2 Span table for local mode

Add a `trace_spans` table so local diagnostics retain the trace hierarchy even
without an external backend:

| Column | Type | Null | Purpose |
|---|---|---:|---|
| `id` | integer PK | no | local row identity |
| `trace_id` | varchar(32) | no | trace identity |
| `span_id` | varchar(16) | no | span identity |
| `parent_span_id` | varchar(16) | yes | causal parent |
| `name` | text | no | span operation name |
| `kind` | text/integer | no | client/server/internal/producer/consumer |
| `start_timestamp` | datetime/text | no | UTC start |
| `end_timestamp` | datetime/text | no | UTC end |
| `status_code` | text/integer | no | unset/ok/error |
| `status_message` | text | yes | bounded status detail |
| `service_name` | text | no | producer service |
| `service_version` | text | yes | producer version |
| `service_instance_id` | text | no | producer runtime |
| `client_instance_id` | text | yes | originating UI launch when known |
| `attributes` | text | yes | bounded JSON attributes |
| `events` | text | yes | bounded JSON span events |

Constraints/indexes:

- unique `(span_id)` is insufficient because storage may ingest from multiple
  trust domains; prefer unique `(trace_id, span_id)`;
- index `(trace_id, start_timestamp)`;
- index `(client_instance_id, start_timestamp)`; and
- index `(service_name, service_instance_id, start_timestamp)`.

The local `SQLiteSpanExporter` converts ended SDK spans into these rows. It uses
a batch span processor and the same serialized writer boundary as logs.

### 12.3 Schema files

Modify/add under:

```text
packages/infrastructure/logger/src/entity-schema/
  log-entry.schema.ts
  trace-span.schema.ts

packages/infrastructure/logger/src/orm/
  logging-orm-base.ts
```

Update `PinoSQLiteTransport` to persist new log fields and reject oversized or
malformed attribute payloads without recursively logging through itself.

### 12.4 Migration

Follow the mandated logging migration workflow:

1. update schemas;
2. run `pnpm run build`;
3. delete the one existing `*-create-log-entries.ts` migration;
4. run
   `pnpm run migration:gen:logging ./packages/infrastructure/logger/src/migrations/create-log-entries`;
5. add the Qualcomm header and `import type` correction; and
6. update `logging-migration-index.ts` to the new timestamp.

Do not hand-write the migration SQL.

## 13. Query Contracts and Diagnostic APIs

### 13.1 Log read models

Phase 1 of the human-readable logging design already adds
`searchProjectLogs` (`ProjectLogSearchCriteria`: required `projectId`,
optional `clientName`, `clientInstanceId`, `origin`, `minLevel`, plus
`limit`, `order`, and `cursor`) and `listClientInstances`. Their contract
lives in `@arc/logger`, not core, because logs are operational data (phase 1
design decision 26). This LLD adds a cross-project search with the remaining
filters, and `getTrace`. Extend the same contract with plain data types:

```text
packages/infrastructure/logger/src/queries/
  log-entry-read-model.ts
  trace-span-read-model.ts
  diagnostic-search-criteria.ts
  log-query-service.ts
```

Suggested port operations:

```typescript
interface LogQueryService {
  searchProjectLogs(criteria: ProjectLogSearchCriteria): Promise<LogSearchPage>; // phase 1
  listClientInstances(criteria: ClientInstanceSearchCriteria): Promise<ClientInstancePage>; // phase 1
  searchLogs(criteria: DiagnosticSearchCriteria): Promise<LogSearchPage>;
  getTrace(traceId: string): Promise<TraceDiagnosticReadModel>;
}
```

`DiagnosticSearchCriteria` contains bounded optional filters and cursor
pagination:

```typescript
interface DiagnosticSearchCriteria {
  from: string;
  to: string;
  projectId?: string;
  eventName?: string;
  traceId?: string;
  clientName?: string;
  clientInstanceId?: string;
  origin?: LogOrigin;
  minLevel?: LogLevel;
  outcome?: 'success' | 'error';
  limit: number;
  cursor?: string;
}
```

Avoid unbounded “get all logs” reads.

### 13.2 Read paths

As in phase 1, log and trace reads do not go through core or the query bus.
The diagnostics controller injects `LogQueryService` through the
`LOG_QUERY_SERVICE` token and calls `searchLogs` and `getTrace` directly, as
the logging controller calls `searchProjectLogs` and `listClientInstances`.
No core queries or handlers are added. The controller contains no TypeORM or
OpenTelemetry code; `DbLogQueryService` implements the reads.

### 13.3 REST API

Recommended endpoints:

```http
GET /arc-api/v1/diagnostics/logs
GET /arc-api/v1/diagnostics/traces/:traceId
POST /arc-api/v1/diagnostics/bundles
```

Phase 1 provides only project-scoped reads and `GET /client-instances`; an
earlier phase 1 `GET /diagnostics/logs` was removed. This LLD adds
`GET /diagnostics/logs` as a cross-project search with the bounded discovery
filters above, which also exposes records without a project (startup,
housekeeping).

`GET /diagnostics/traces/:traceId` returns spans in parent-child order plus
correlated logs ordered by timestamp within each span. A UI may also present a
flat timestamp view, but the API retains causal relationships.

`POST /diagnostics/bundles` creates a bounded export from an explicit time range
or `clientInstanceId`; it does not infer access from the identifier itself.

### 13.4 Existing project logs endpoint

During compatibility, retain:

```http
GET /arc-api/v1/projects/:projectId/logs
```

Phase 1 already changed it to call the bounded
`LogQueryService.searchProjectLogs`, with optional `clientName`,
`clientInstanceId`, `origin`, and `minLevel`, instead of filtering
`source = authenticated clientId`. This LLD adds authorized scope and time
limits. Decide whether to keep it as a convenience over the diagnostics API or
deprecate it once clients adopt that API.

## 14. Module Wiring

### 14.1 Logging infrastructure module

Revise `packages/api/src/infrastructure-wrapper/logging.module.ts` to provide:

- logging `DataSource`;
- process resource descriptor;
- active log context provider;
- singleton Pino instance;
- singleton `PinoLogService` under the existing `LOGGER` token;
- `SQLiteTransport`;
- SQLite span exporter/local span processor when local storage is enabled; and
- `DbLogQueryService` under the `LOG_QUERY_SERVICE` token.

The logger provider remains singleton scope. Do not make it Nest request-scoped.

### 14.2 CQRS module

Revise `packages/api/src/infrastructure-wrapper/arc-cqrs.module.ts` so command
and query executions pass through API-owned tracing decorators and then through
the existing core buses. Handler registries, `UnitOfWork` ownership, and
transaction behavior remain unchanged. Log reads do not use the query bus
(§13.2); their HTTP server spans cover them.

### 14.3 Application module

`packages/api/src/app.module.ts` continues registering request middleware. Add
diagnostics modules/controllers without moving telemetry implementation into
controllers.

## 15. Configuration

All configuration is environment-driven. Suggested variables:

| Variable | Default | Meaning |
|---|---|---|
| `OTEL_SDK_DISABLED` | `false` | standard SDK kill switch |
| `OTEL_SERVICE_NAME` | `audioreach-creator-api` | standard service name override |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | unset | enable OTLP export when set |
| `OTEL_TRACES_SAMPLER` | `always_on` in local mode | standard sampler selection |
| `ARC_TELEMETRY_SQLITE_ENABLED` | `true` in local mode | local span/log persistence |
| `ARC_TELEMETRY_RETENTION_DAYS` | product decision | cleanup horizon |
| `ARC_DIAGNOSTIC_MAX_ROWS` | bounded value | query/export safety limit |
| `ARC_DIAGNOSTIC_MAX_BUNDLE_BYTES` | bounded value | export safety limit |

Standard OpenTelemetry variables should be preferred over ARC-specific
duplicates when the SDK already defines the behavior.

## 16. Validation and Security Rules

### 16.1 Identifier validation

Validate at ingress:

```text
traceId:  32 lowercase hexadecimal characters, not all zero
spanId:   16 lowercase hexadecimal characters, not all zero
client instance: UUID initially, maximum documented length
service fields: bounded printable strings
attributes: allowlisted keys and bounded serialized size
```

Malformed optional trace metadata is dropped or isolated; it does not become a
database or authorization primitive.

### 16.2 Request data policy

Replace the current generic header/body logging with:

- allowlisted headers;
- route template instead of raw URL where possible;
- request/response sizes instead of bodies;
- explicit domain identifiers supplied by trusted application code; and
- opt-in debug capture only for specifically reviewed fields.

### 16.3 Client telemetry trust

Persist server-observed time separately. Store the submitted resource identity
and the authenticated subject independently. Never let a client claim API/worker
resource identity. Apply rate, size, and batch limits to log ingestion.

### 16.4 Diagnostic authorization

Trace IDs and instance IDs are selectors, not secrets. Every query and export
uses the normal authenticated authorization scope. The current local trust
model must be documented before opening diagnostics beyond localhost.

## 17. Failure and Backpressure Behavior

- Logging or span export failure shall not fail ordinary application work.
- SQLite writes use a bounded queue and one writer owner in local mode.
- Queue overflow follows an explicit policy: retain warn/error/critical first,
  count dropped lower-severity records, and emit one rate-limited fallback
  message to stderr.
- Export failures use bounded retry with backoff where supported.
- The telemetry pipeline must not log its own failure through the same failing
  pipeline recursively.
- Shutdown attempts a bounded flush and then exits.
- Worker termination drains or explicitly reports dropped telemetry.

## 18. Sampling and Retention

For the initial local desktop deployment, use parent-based always-on tracing so
diagnostic bundles are complete and behavior is easy to understand. Retention
and maximum database size provide the primary bound.

For future multi-node deployments:

- use parent-based probabilistic sampling for ordinary traffic if volume
  requires it;
- consider Collector tail sampling for errors or high-latency traces;
- keep error logs even when a trace is not recorded, with trace IDs when an
  active propagated context exists; and
- configure retention independently for logs and spans.

Sampling decisions must be visible in configuration and diagnostics.

## 19. Implementation Phases

### Phase 0: contract tests and baseline

- Capture current log endpoint, project query, logger, middleware, and worker
  behavior in tests.
- Add concurrency tests demonstrating that the current request tag does not
  provide deep automatic correlation; the test becomes the target for the new
  behavior.

### Phase 1: API trace context and correlated Pino logs

- Add telemetry bootstrap/shutdown.
- Add HTTP instrumentation.
- Add active-context provider and Pino enrichment.
- Revise request middleware and exception filters.
- Add trace columns, `service_version`, `observed_timestamp`, and
  `attributes`, and regenerate the logging migration.
- Keep existing client endpoints compatible.

Exit criterion: concurrent API requests produce correctly isolated trace IDs
on logs emitted from shared core services.

### Phase 2: local span persistence and diagnostic queries

- Add `trace_spans` schema and SQLite exporter.
- Extend the search query and add the get-trace CQRS query.
- Extend the bounded diagnostic REST endpoints.

Exit criterion: a support engineer can discover a request by time/project/route
and expand its local trace.

### Phase 3: command/query and worker spans

- Add tracing bus decorators in the API composition layer.
- Add worker envelopes and context injection/extraction.
- Add worker-local singleton logger/SDK.
- Add dedicated telemetry message channels and parent-side serialized writes.

Exit criterion: an API request, command/query, worker task, and all their logs
appear in one trace with correct parentage.

### Phase 4: maintained UI and diagnostic bundle

- Add UI OpenTelemetry initialization and per-launch `service.instance.id`.
- Inject W3C trace headers and the optional ARC client-instance header.
- Add UI diagnostic export controls.
- Add bounded server bundle generation and manifest/redaction.

Exit criterion: reconnecting during one UI launch retains instance grouping,
and a user can export useful diagnostics without knowing a trace ID.

### Phase 5: OTLP and multi-node deployment

- Add OTLP exporter configuration.
- Deploy an OpenTelemetry Collector when required.
- Select log/trace backends and retention based on deployment needs.
- Disable direct shared-SQLite writes across processes/nodes.
- Deprecate the proprietary client log endpoint when client migration permits.

## 20. Test Strategy

### 20.1 Logger unit tests

Under `packages/infrastructure/logger/tests/`:

- active span adds correct trace/span IDs;
- no active span omits those fields;
- resource fields are always server/worker-owned;
- producer and observed timestamps are distinct when supplied;
- errors retain structured message/stack;
- malformed client metadata is rejected or sanitized; and
- concurrent async contexts do not cross-contaminate.

### 20.2 SQLite integration tests

- new schema fields round-trip;
- spans and logs query by trace ID;
- project/client-instance/time filters use bounded pagination;
- migration initializes a clean database;
- one serialized writer handles interleaved worker/API records; and
- exporter failure does not reject application work.

### 20.3 API E2E tests

- request without `traceparent` receives a server-created trace;
- valid `traceparent` is continued;
- invalid `traceparent` does not fail the API request;
- overlapping requests produce different trace IDs;
- `X-Trace-Id`, if enabled, matches stored telemetry;
- client instance header is validated and searchable;
- trace/instance identifiers do not bypass authorization;
- request bodies and credentials are absent from logs; and
- compatibility endpoints keep their documented response behavior.

### 20.4 Worker integration tests

- worker span shares the parent trace ID;
- worker span has a new span ID and correct parent;
- worker logs use the worker active span;
- two simultaneous worker tasks retain separate contexts;
- telemetry messages cannot be mistaken for task results; and
- worker crash/timeout records the parent-side failure.

### 20.5 Diagnostic export tests

- export works by UI instance and time range;
- manifest includes UTC range and component versions;
- maximum size and row limits are enforced;
- secrets and disallowed bodies are absent; and
- partial export reports missing or dropped telemetry.

## 21. Planned File Impact

| Area | Existing files to change | New files/concepts |
|---|---|---|
| bootstrap | `packages/api/src/main.ts` | application bootstrap split, telemetry lifecycle |
| API middleware | `packages/api/src/infrastructure-wrapper/middleware/request-logger.middleware.ts` | safe request attributes/completion logging |
| exception handling | API exception filters | active span error/status recording |
| API wiring | `app.module.ts`, `arc-cqrs.module.ts`, infrastructure `logging.module.ts` | tracing bus decorators and telemetry providers |
| core logger | normally none to `logger.interface.ts` for correlation | trace fields added only to the `@arc/logger` read models |
| logger adapter | `pino-log.service.ts`, `logger.factory.ts` | active context provider and resource enrichment |
| log persistence | `log-entry.schema.ts`, `pino-sqlite-transport.ts`, ORM base | trace schema and local span exporter |
| queries | `@arc/logger` `LogQueryService`, read models, `DbLogQueryService` | bounded search and get-trace methods, called directly by the diagnostics controller |
| REST logging | current logging controller and DTOs | diagnostics controller/DTOs; transitional ingestion fields |
| worker pool | current Node worker pool, factory, singleton, generic worker | envelope propagation and worker telemetry channel |
| migrations | current one logging migration and index | regenerated single migration |
| tests | logger, API, FS worker, and E2E suites | concurrency, propagation, query, security, export coverage |

## 22. Requirement Traceability

| Requirement | LLD sections |
|---|---|
| end-to-end trace correlation | 6–10 |
| discovery without trace ID | 12–13 |
| one-launch client grouping | 7, 11, 13 |
| core remains framework-neutral | 2, 5, 9 |
| singleton logger and concurrency | 8, 20 |
| worker/process propagation | 10 |
| local SQLite compatibility | 12 |
| future multi-node path | 4, 10, 19 |
| security/privacy | 7, 11, 16 |
| diagnostic export | 13, 19, 20 |

## 23. Explicit Non-Decisions

The following must be chosen before their implementation phase but do not block
the architectural design:

- local retention duration and size thresholds;
- whether local span storage ships in the first implementation increment;
- exact diagnostic endpoint authorization roles;
- whether `X-Trace-Id` is exposed in all environments;
- the UI telemetry SDK/export mechanism;
- the Collector deployment model and final backend; and
- the removal date for `POST /arc-api/v1/logs`.

## 24. References

- [W3C Trace Context Recommendation](https://www.w3.org/TR/trace-context/)
- [OpenTelemetry specification](https://opentelemetry.io/docs/specs/otel/)
- [OpenTelemetry JavaScript](https://opentelemetry.io/docs/languages/js/)
- [OpenTelemetry semantic conventions](https://opentelemetry.io/docs/specs/semconv/)
- [OpenTelemetry Protocol](https://opentelemetry.io/docs/specs/otlp/)
- [OpenTelemetry Collector](https://opentelemetry.io/docs/collector/)
- [Node.js `AsyncLocalStorage`](https://nodejs.org/api/async_context.html#class-asynclocalstorage)
