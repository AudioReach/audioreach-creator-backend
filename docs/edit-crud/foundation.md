<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# LLD1 — Foundation

**Status:** Implemented
**Owner:** Nithin Simon

**Parent:** `overall-design.md` (this folder). Read that first.
**Source of truth:** `docs/superpowers/specs/2026-07-04-modification-framework-requirements.md`

**Scope:** the shared infrastructure every downstream LLD builds on — schema, session context plumbing, staging service, overlay merge, commit-order policy, session guard. Sized for one PR.

---

## 1. Purpose & Scope

- One paragraph on this LLD's role — the foundation layer that unblocks LLD2 (Module Write Path), LLD3 (Read Overlay), LLD4 (Commit), and all Phase 2 work.
- **In scope:** items in §15 of overall-design under LLD1 — schema + migration, `PendingChangeWriter`, `EditActionsQueryService`, `OverlayMerge`, `PendingChangeCache`, `SessionGuard`, session hand-off via `execute(cmd, session?)` (Pattern A), `WriteContext` on UoW + `groupId` stamping, `CommandBus` session-required + mode-allow-list checks with three command categories (Case 1/2/3 per §7a).
- **Out of scope:** edit repos per aggregate (LLD2), read-service adapters per aggregate (LLD3), commit service (LLD4), stage/unstage (LLD4), delete cascade (LLD5), DiffMerge (LLD6a-c).

---

## 2. Requirements Owned

- REQ-EA-01 to REQ-EA-14 (pending-change persistence, effective state, staging defaults, payload rules, capture-once).
- REQ-AGG-01 to REQ-AGG-03 (aggregate scoping mechanics, at the query-service level; specific edit-repo enforcement is LLD2).
- REQ-ATO-01 to REQ-ATO-05 (API-call atomicity via `groupId`).
- REQ-SESS-01, REQ-SESS-05, REQ-SESS-06 (session existence + mode allow-list gating).
- REQ-CMT-02 apply-order requirement is acknowledged; the commit service itself (including apply-order code) is deferred to a dedicated Commit LLD outside LLD1.
- I1 (single active session), I2 (single-valued effective state), I3 (capture-once), I4 (aggregate scoping), I5 (API-call atomicity), I7 (only STAGED at commit — filter infrastructure), I9 (read-overlay parity).
- NFR-INDEX-01 (index coverage), NFR-CONSIST-01 (transaction wrap by UoW).

---

## 3. Frozen Constraints (unchanged by this LLD)

- `project_sessions`, `session_commits` table shapes (session existence + audit are already-implemented infrastructure).
- All entity tables (`spf_modules`, `subgraphs`, `containers`, `nodes`, `data_ports`, `control_ports`, etc.).
- CQRS framework (`CommandBus`, `QueryBus`, `BaseCommand`, `BaseQuery`, handler registries).
- Existing `UnitOfWork` core interface + `TypeOrmUnitOfWork` adapter — extended, not replaced.
- Migration workflow per `CLAUDE.md` (regenerate single `initial-create` migration).

---

## 4. Architecture Overview (LLD1 slice)

LLD1 delivers the shared plumbing every later LLD depends on. It touches all three layers but adds no aggregate-specific code (that lives in LLD2+). Here is how LLD1's components fit inside the overall architecture:

```
┌────────────────────────────────────────────────────────────────────────┐
│  @arc/api                                                              │
│                                                                        │
│    SessionGuard                                                        │
│      - Depends on: ISessionRepository port (§7b.3)                     │
│      - Attaches session → request.arcSession                           │
│                                                                        │
│    SessionRequiredError filter, SessionModeNotAllowedError filter      │
│      - Maps to 403 with structured body                                │
└──────────────────────────┬─────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────────────────────┐
│  @arc/core                                                             │
│                                                                        │
│    BaseCommand (extended)  ← static requiresSession + allowedModes     │
│    CommandBus (extended)   ← optional session arg + required+mode check│
│                                                                        │
│    change-vocabulary.ts (extended)  ← + SOURCE, PENDING_CHANGE_STATUS  │
│    ActiveSession (new)    { sessionId, mode, fileSystemId, projectId? }│
│    WriteContext (new)     { session: ActiveSession, groupId: string }  │
│    SessionRequiredError (new), SessionModeNotAllowedError (new)        │
│                                                                        │
│    UnitOfWork port (extended):                                         │
│      + setWriteContext(ctx) / getWriteContext()                        │
│      + applyCachedActions()                                            │
│                                                                        │
│    New ports:                                                          │
│      - ISessionRepository (session lifecycle + lookup — §7b.3)         │
└──────────────────────────┬─────────────────────────────────────────────┘
                           │  port adapters
                           ▼
┌────────────────────────────────────────────────────────────────────────┐
│  @arc/infrastructure/persistence                                       │
│                                                                        │
│    entity_schema:                                                      │
│      - edit-action.schema.ts (reshaped)                                │
│      - session-entity-version.schema.ts (new)                          │
│                                                                        │
│    queries/edit-session:                                               │
│      - edit-actions-query-service.ts (rewrite)                         │
│      - overlay-merge.ts (rewrite)                                      │
│      - field-path-reducer.ts (new)                                     │
│                                                                        │
│    repositories/session:                                               │
│      - typeorm-session.repository.ts (new)                             │
│                                                                        │
│    services:                                                           │
│      - pending-change-writer.ts (rewrite of former staging service)    │
│      - pending-change-cache.ts (new)                                   │
│                                                                        │
│    unit-of-work:                                                       │
│      - typeorm-unit-of-work.ts (extended)                              │
│                                                                        │
│    migrations:                                                         │
│      - initial-create migration regenerated                            │
└────────────────────────────────────────────────────────────────────────┘
```

**Integration points at boundaries:**

- **`CommandBus` ↔ `UoW`:** CommandBus receives an `ActiveSession` on `execute()`, creates a UoW via existing factory, calls `uow.setWriteContext({ session, groupId: uuid() })` before starting the transaction. Handler receives `(cmd, uow)`.
- **`SessionGuard` ↔ port:** Guard depends on `ISessionRepository` (core port). Calls `findActiveSessionByProjectId(projectId)` for the request's project. Wired via NestJS DI to the persistence adapter.
- **`PendingChangeWriter` ↔ `UoW`:** Writer reads `uow.getWriteContext()` for `sessionId`, `mode`, `groupId`. When constructed with `cache: true`, the writer holds a `PendingChangeCache` (persistence-internal, not a core port) that buffers row-shaping work until `uow.applyCachedActions()` flushes it.
- **Read-service adapters (LLD3+) ↔ `EditActionsQueryService` + `OverlayMerge`:** every read service will construct with these dependencies. LLD1 delivers them; LLD3 wires them into each aggregate's read adapter.
- **Aggregate edit-repo adapters (LLD2+) ↔ `PendingChangeWriter`:** every edit repo will inject the writer and delegate all row-shaping to it. LLD1 delivers the writer; LLD2 wires it.

---

## 5. Schema Changes

Single migration regenerated per the project workflow (`CLAUDE.md` §Database Migration Workflow). No additive migration since the project is pre-production and existing dev-DB rows are disposable.

### 5.1 `edit_actions` — reshape

Column-by-column diff:

| Column | Type | Current schema | LLD1 schema | Change |
|---|---|---|---|---|
| `change_id` | integer PK | ✓ | ✓ | unchanged |
| `session_id` | integer, NOT NULL | ✓ | ✓ | unchanged |
| `aggregate_id` | integer, NOT NULL | ✓ | ✓ | unchanged |
| `system_id` | integer, NOT NULL | ✓ | (renamed) | **rename → `target_system_id`** |
| `table_name` | varchar(100), NOT NULL | ✓ | (renamed) | **rename → `target_table`** |
| `operation` | simple-enum | ✓ | ✓ | unchanged (`NONE / CREATE / UPDATE / DELETE`) |
| `payload` | simple-json, NOT NULL | ✓ | — | **dropped** (replaced by `field_path` + `new_value`) |
| `field_path` | varchar, nullable | — | ✓ | **added** — addressing scheme (§4.1 overall-design) |
| `new_value` | simple-json, nullable | — | ✓ | **added** — replacement value for the addressed target |
| `source` | simple-enum, NOT NULL | — | ✓ | **added** — `MANUAL / DIFF_TOOL / AUTO_ROUTING` |
| `change_status` | simple-enum | ✓ | ✓ | unchanged; default `STAGED` |
| `base_version` | integer, nullable | ✓ | — | **dropped** (moves to `session_entity_versions` side-table) |
| `group_id` | text, nullable | ✓ | ✓ | unchanged (UUID for API-call atomicity) |
| `linked_entity_group_id` | varchar, nullable | — | ✓ | **added** — REQ-ACG-01 server-enforced |
| `created_at` | datetime | ✓ | ✓ | unchanged |
| `valid_until` | datetime, nullable | ✓ | ✓ | unchanged |

**Enum values:**
- `operation`: from existing `CHANGE_OPERATION`.
- `change_status`: from existing `CHANGE_STATUS`.
- `source`: new `SOURCE` const defined in `change-vocabulary.ts` (§6).

**Indexes:**

| Index | Columns | Filter | Purpose |
|---|---|---|---|
| `uniq_edit_actions_current` (unique) | `session_id, target_system_id, field_path` | `WHERE valid_until IS NULL` | Supersession + one-active-row-per-slot |
| `idx_edit_actions_agg_active` | `session_id, aggregate_id` | `WHERE valid_until IS NULL` | Aggregate-scoped overlay |
| `idx_edit_actions_table_active` | `session_id, target_table` | `WHERE valid_until IS NULL` | Table-scoped queries |
| `idx_edit_actions_status_active` | `session_id, change_status` | `WHERE valid_until IS NULL` | Stage/commit filters |
| `idx_edit_actions_source_active` | `session_id, source` | `WHERE valid_until IS NULL` | Wipe-by-source on diff re-apply |
| `idx_edit_actions_linked_group_active` | `session_id, linked_entity_group_id` | `WHERE valid_until IS NULL AND linked_entity_group_id IS NOT NULL` | Cross-entity group expansion |

**TypeORM `EntitySchema` file:** replace the existing `edit-action.schema.ts` in `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/edit-session/`. Row interface `EditActionRow` retains its exported name.

### 5.2 `session_entity_versions` — new side-table

Purpose: capture-once storage for optimistic-lock `baseVersion` per session-entity (REQ-EA-11, REQ-EA-13).

| Column | Type | Notes |
|---|---|---|
| `session_id` | integer, PK part | FK → `project_sessions(session_id)` ON DELETE CASCADE |
| `target_system_id` | integer, PK part | The entity's systemId |
| `base_version` | integer, NOT NULL | Committed `version` of the entity at first modification |

Composite PK on `(session_id, target_system_id)`.

**INSERT-IGNORE semantics:**
- SQLite: `INSERT OR IGNORE INTO session_entity_versions (...) VALUES (...)`.
- Postgres reference: `INSERT ... ON CONFLICT (session_id, target_system_id) DO NOTHING`.

No additional indexes needed — the composite PK covers every query pattern (write by exact key on first modification; read by exact key at commit time).

Session-created entities never get a row here (REQ-EA-12). Post-commit cleanup removes rows for applied entities so subsequent modifications capture a fresh baseline.

### 5.3 Migration workflow

Per `CLAUDE.md` §Database Migration Workflow:

1. Update entity schemas (`edit-action.schema.ts`, add `session-entity-version.schema.ts`).
2. Run `pnpm run build` so the TypeORM CLI can see updated schemas.
3. Delete the current migration file (`packages/infrastructure/persistence/src/persistence-typeorm-sqllite/migrations/<timestamp>-initial-create.ts`).
4. Run `pnpm run migration:gen ./packages/infrastructure/persistence/src/persistence-typeorm-sqllite/migrations/initial-create`.
5. Post-process the generated file — add Qualcomm copyright header, change `import {MigrationInterface, QueryRunner} from 'typeorm'` to `import type {...}`.
6. Update `migration-index.ts` to reference the new timestamp.

**Data considerations:** dev-only DBs. Any existing `edit_actions` rows are discarded when the migration rebuilds. No production data to preserve.

---

## 6. Change Vocabulary Updates (`@arc/core`)

### 6.1 Existing constants unchanged

- `CHANGE_OPERATION` (`NONE / CREATE / UPDATE / DELETE`) — kept.
- `CHANGE_STATUS` (`STAGED / UNSTAGED`) — kept.

### 6.2 New constants

- `SOURCE` (`MANUAL / DIFF_TOOL / AUTO_ROUTING`) — const + type export.
- `PENDING_CHANGE_STATUS` (`STAGED / UNSTAGED / PARTIAL`) — const + type export as `PendingChangeStatus`.
  - Distinct from `CHANGE_STATUS` (`STAGED / UNSTAGED`): a single `edit_actions` row is always `STAGED` or `UNSTAGED`; `PARTIAL` only arises at the entity level when an entity has a mix of both across multiple rows.
  - Defined in `@arc/core` (not `@arc/persistence`) so `@arc/api` can reference it on entity DTOs without violating the dependency direction (persistence → core is allowed; api → persistence directly is not).
- Location: `packages/core/src/application/shared/change-vocabulary.ts` (extend existing file).

### 6.3 `ISSUE_ENTITY_TYPE` extension

The core-result-format design (`docs/core-result-format/design/core-result-format-design.md` §2.3) defines `ISSUE_ENTITY_TYPE` in `packages/core/src/shared/issues/impacted-entity.ts` with these values: `SpfModule, DataLink, ControlLink, Subgraph, UseCase, Container, SpfModuleDefinition`.

LLD1 extends it with:
- **`Project`** — used by `StartSessionHandler` when `projectId` doesn't resolve to a file (§7b).

Downstream LLDs may extend further (e.g., LLD2 adds `DataPort`, `ControlPort`, `Subsystem`).

---

## 7. `SessionGuard` (`@arc/api`)

### 7.1 Responsibilities

- Resolve active session for target project (REQ-SESS-01, REQ-SESS-05). URLs carry `{projectId}` per the codebase's existing convention; the guard resolves `projectId → fileSystemId → active session` in one port call (see §7.5).
- Attach session (including its `mode`, `fileSystemId`, and `projectId`) to request-scoped context — surfaces to UoW downstream.
- **No mode allow-list check.** Mode enforcement is handled by CommandBus (§7a) so it applies uniformly to direct API dispatch and to dynamic dispatch paths (e.g., validation auto-fix — see validation framework doc §6.3, where the apply-fix controller routes to CQRS commands dynamically based on `commandType` in the body; a Nest guard on that endpoint cannot know the underlying command's mode requirements).
- No DB writes.

### 7.2 Trigger mechanism

- NestJS guard applied to controllers/endpoints whose command declares `requiresSession = true` (Case 1 and Case 2 — see §7a).
- Applied via `@UseGuards(SessionGuard)` on controller classes or specific methods.
- Read-only endpoints and Case-3 endpoints (`requiresSession = false` — e.g., `start-session`, `upload-file`, `acknowledge-data-loss`) omit the guard. Boot-time cross-check (§7a.7) enforces this pairing at startup.

### 7.3 Failure modes

- No active session for the project's file → `403 Forbidden` with structured error (session-not-active).
- Project not found / not connected → `404` (delegated to the same port or the controller before the guard).

### 7.4 Integration points

- Wired into `@arc/api` module providers.
- Attaches session to a request-scoped `WriteContext` accessible from `UnitOfWork` (§8).

### 7.5 Session query port

- Uses `ISessionRepository.findActiveSessionByProjectId(projectId): Promise<ProjectSession | null>` (§7b.3). Single port for both SessionGuard and session-lifecycle handlers.
- Adapter in persistence: joins `projects` → `project_sessions WHERE status = 'ACTIVE'` in one SQL round-trip.
- Same pattern as the existing read-side `ProjectQueryService.getFileIdByProjectId(projectId)` — read APIs already use `projectId` in URLs and resolve to `fileSystemId` internally. Write APIs match this convention.

---

## 7a. CommandBus Session & Mode Enforcement (`@arc/core`)

### 7a.1 Responsibility

- Enforce REQ-SESS-06: every command declares whether it needs an active session, and if so which session-modes are permitted.
- Applies to every command that flows through the CommandBus regardless of dispatch origin (direct controller, `FixCommandDispatcher`, future batch/retry endpoints).
- Three command categories (see §7a.2 for declaration form):
  - **Session-scoped, mode-restricted** — needs session, only listed modes accepted (e.g., `PatchSpfModuleCommand` → `[DESIGNER]`). Writes go to `edit_actions` overlay via edit-repos.
  - **Session-scoped, mode-agnostic** — needs session, any mode accepted (e.g., `EndSessionCommand`). Overlay writes.
  - **Session-agnostic** — no active session required; runs when file is open in read-only state (e.g., `StartSessionCommand`, `UploadFileCommand`, `AcknowledgeDataLossCommand`). Writes go **directly to real entity tables** via existing entity repositories (`IProjectRepository`, `IFileRepository`, etc.). Do not use `PendingChangeWriter` and do not touch `edit_actions`.

### 7a.2 Command-side declaration

Every command class declares two plain static fields:

```
export class BaseCommand {
  static readonly requiresSession: boolean            = true    // safest default
  static readonly allowedModes:    readonly SessionMode[] = []  // empty = any mode (only meaningful when requiresSession = true)
}

// Case 1 — session + specific mode
export class PatchSpfModuleCommand extends BaseCommand {
  static readonly requiresSession = true
  static readonly allowedModes    = [SESSION_MODE.Designer]
  ...
}

export class AddModuleCommand extends BaseCommand {
  static readonly requiresSession = true
  static readonly allowedModes    = [SESSION_MODE.Designer, SESSION_MODE.DiffMerge]
  ...
}

// Case 2 — session + any mode (session-lifecycle, session-neutral admin)
export class EndSessionCommand extends BaseCommand {
  static readonly requiresSession = true
  static readonly allowedModes    = []       // end-session valid in any mode
  ...
}

// Case 3 — no session required (writes directly to real entity tables)
export class StartSessionCommand extends BaseCommand {
  static readonly requiresSession = false
  static readonly allowedModes    = []
  ...
}

export class UploadFileCommand extends BaseCommand {
  static readonly requiresSession = false
  static readonly allowedModes    = []
  ...
}
```

- `requiresSession = true, allowedModes.length > 0` → Case 1.
- `requiresSession = true, allowedModes.length === 0` → Case 2 ("any mode").
- `requiresSession = false` → Case 3. `allowedModes` is irrelevant and must be empty.
- Pure TypeScript — no NestJS import, no reflect-metadata. Compatible with React Native consumers.

### 7a.3 Bus-side enforcement

`CommandBus.execute(cmd, session?)` accepts an optional `ActiveSession`. It performs both checks up front, then conditionally sets `WriteContext`, then invokes the handler. **CommandBus does not manage transactions** — that responsibility stays with each handler (see §7a.7):

```
CommandBus.execute(cmd, session?):
  const Ctor = cmd.constructor as typeof BaseCommand

  // 1. Session requirement
  if Ctor.requiresSession && !session:
    throw new SessionRequiredError(Ctor.name)

  // 2. Mode gate (only meaningful when a session is present)
  if session && Ctor.allowedModes.length > 0 && !Ctor.allowedModes.includes(session.mode):
    throw new SessionModeNotAllowedError(Ctor.name, session.mode, Ctor.allowedModes)

  // 3. WriteContext setup — only when a session is present.
  //    Case-3 handlers use existing entity repos (IProjectRepository etc.) that do not
  //    read WriteContext, so no context is set.
  if session:
    uow.setWriteContext({ session, groupId: uuidv4() })

  // 4. Invoke the handler. Handler owns transaction lifecycle (see §7a.7).
  return handler.handle(cmd, uow)
```

Placement: both checks run **before** the handler is invoked, so rejected calls never reach handler code or open a transaction.

### 7a.4 Transaction ownership — handlers, not the bus

**Handlers own `uow.startTransaction() / commit() / rollback()`.** Reasons:

- **Multi-phase handlers need multiple transactions.** `UploadFileHandler` parses the ACDB file in phases (header parse → bulk insert entities → status update); each phase commits independently so partial progress isn't lost on a downstream failure. A blanket command-scoped transaction breaks this pattern.
- **Handler-local knowledge.** Only the handler knows whether its work is one logical unit (single transaction wrapping the whole body) or a sequence of independently-durable phases (multiple transactions).
- **Preserves the existing convention.** Every current handler (e.g., `UploadFileHandler`, `AcknowledgeDataLossHandler`) already drives its own transaction. LLD1 does not change this contract.

Convention for LLD1/LLD2 write handlers (single logical unit):

```ts
async handle(cmd, uow): Promise<Result<WriteResult>> {
  await uow.startTransaction()
  try {
    // ... domain work, edit-repo calls, applyCachedActions() if using cached bulk mode ...
    await uow.commit()
    return Result.ok({ groupId: uow.getWriteContext().groupId })
  } catch (err) {
    await uow.rollback()
    throw err
  }
}
```

Multi-phase handlers (e.g., `UploadFileHandler`) open/close multiple transactions inside `handle()` as their business logic requires. `WriteContext` is set once by CommandBus and persists across all sub-transactions — so every `edit_actions` row written by any sub-transaction of a single command dispatch carries the same `groupId` (correct: one API call → one groupId regardless of internal transaction boundaries).

### 7a.5 Error mapping (`@arc/api`)

- `SessionRequiredError` mapped to `403 Forbidden` by an exception filter.
- `SessionModeNotAllowedError` mapped to `403 Forbidden` by the same/adjacent filter.
- Both response bodies include: command type name, and (for the mode variant) current mode + allowed modes.

### 7a.6 Interaction with `SessionGuard`

- Endpoints for **Case 1** and **Case 2** commands apply `@UseGuards(SessionGuard)`; the guard resolves session → attaches to request; CommandBus receives it in `execute(cmd, session)`.
- Endpoints for **Case 3** commands do **not** apply `SessionGuard`; CommandBus receives `session = undefined`.
- If SessionGuard rejects (no active session, wrong project, etc.), the request never reaches CommandBus.
- Case-2 commands: guard-check passes; CommandBus mode-check is a no-op because `allowedModes = []`. Command runs regardless of mode.
- Case-3 commands: no guard runs; `requiresSession = false` short-circuits the session check.

### 7a.7 Boot-time wiring cross-check (`@arc/api`)

To catch the "forgot `@UseGuards(SessionGuard)` on a Case-1/2 endpoint" wiring bug at startup instead of runtime, the API module runs a one-shot assertion during `onApplicationBootstrap`:

- Iterate every controller route registered with the CommandBus.
- Look up the command class the route dispatches (via a route → command registry, or via reflect-metadata on the controller method).
- Assert: `Ctor.requiresSession === true` ⇒ the route (or its controller) has `SessionGuard` in `@UseGuards`.
- Assert: `Ctor.requiresSession === false` ⇒ the route does **not** apply `SessionGuard` (avoids silently attaching a session that the command declared it doesn't need).
- Failure logs the offending route + command and aborts app boot with a clear message.

`reflect-metadata` usage stays in `packages/api` (adapter layer). `packages/core` remains framework-free.

### 7a.8 Testing

- Unit test: Case-1 command dispatched with matching mode → passes; disallowed mode → throws `SessionModeNotAllowedError`.
- Unit test: Case-2 command → passes regardless of mode.
- Unit test: Case-3 command with `session = undefined` → passes; `requiresSession = true` command with `session = undefined` → throws `SessionRequiredError`.
- Integration test: end-to-end request through SessionGuard + CommandBus with a session in wrong mode → 403.
- Boot-test: mis-wired endpoint (Case-1 command without SessionGuard) fails app startup with a clear error.

---

## 7b. Session Lifecycle Handlers (`@arc/core`)

The API endpoints `POST /projects/:projectId/start-session` and `POST /projects/:projectId/end-session` currently exist as stubs (throw `NotImplementedException`). LLD1 delivers their handlers — they're the foundation for every downstream write LLD.

### 7b.1 StartSessionCommand + Handler

Command:
```ts
// packages/core/src/application/edit-session/start-session/start-session.command.ts
export class StartSessionCommand extends BaseCommand {
  // Case 3 — no session required (session is the very thing we're creating).
  static readonly requiresSession = false
  static readonly allowedModes:    readonly SessionMode[] = []

  constructor(
    public readonly projectId: string,
    public readonly clientId:  string,           // from request context; also passed to BaseCommand
    public readonly mode:      SessionMode,      // DESIGNER / DIFF_MERGE / TUNING / DISCOVERY_WIZARD
    public readonly userId?:   string,
  ) { super(clientId) }
}
```

The controller constructs `new StartSessionCommand(dto.projectId, dto.clientId, dto.mode, dto.userId)` inline from the request DTO. No `fromPayload` — session lifecycle is not a validation auto-fix action, so `FixCommandDispatcher` will never dispatch it. Add `fromPayload` only if that changes.

Handler:
```ts
export class StartSessionHandler implements CommandHandler<StartSessionCommand, Result<SessionResult>> {
  async handle(cmd: StartSessionCommand, uow: UnitOfWork): Promise<Result<SessionResult>> {
    await uow.startTransaction()
    try {
      const sessionRepo = uow.getSessionRepository()

      // 1. Resolve projectId → fileSystemId
      const fileSystemId = await sessionRepo.findFileSystemIdByProjectId(cmd.projectId)
      if (fileSystemId === null) {
        await uow.rollback()
        return Result.fail(IssueFactory.notFound(ISSUE_ENTITY_TYPE.Project, /* projectId */))
      }

      // 2. Enforce I1: no ACTIVE session for this file may already exist.
      const existing = await sessionRepo.findActiveSessionByFileSystemId(fileSystemId)
      if (existing) {
        await uow.rollback()
        return Result.fail({
          code:     'ARC-SESSION-ALREADY-ACTIVE',
          message:  `An active session already exists for project ${cmd.projectId} (sessionId ${existing.sessionId}, mode ${existing.mode}). End it before starting a new one.`,
          severity: IssueSeverity.Error,
        })
      }

      // 3. Insert new session row (unique partial index enforces I1 as a backstop).
      const sessionId = await sessionRepo.createSession({
        fileSystemId, clientId: cmd.clientId, sessionMode: cmd.mode, userId: cmd.userId ?? null,
      })

      await uow.commit()
      return Result.ok({ sessionId, projectId: cmd.projectId, sessionMode: cmd.mode, summary: 'Session started.' })
    } catch (err) {
      await uow.rollback()
      throw err
    }
  }
}
```

### 7b.2 EndSessionCommand + Handler

Command: `EndSessionCommand(projectId)` — declares `requiresSession = true`, `allowedModes = []` (Case 2 — any mode may end its own session). Session-existence enforced by SessionGuard on the endpoint; the empty `allowedModes` makes the CommandBus mode-check a no-op.

Handler implements REQ-SESS-09 and REQ-SESS-10:

```ts
export class EndSessionHandler implements CommandHandler<EndSessionCommand, Result<SessionResult>> {
  async handle(cmd: EndSessionCommand, uow: UnitOfWork): Promise<Result<SessionResult>> {
    await uow.startTransaction()
    try {
      const session = uow.getWriteContext().session   // populated by CommandBus from SessionGuard's attach
      const sessionRepo = uow.getSessionRepository()

      // REQ-SESS-09: discard all UNSTAGED edit-actions for this session.
      // Adapter runs a direct DELETE — no delegation to another persistence service.
      const wipedCount = await sessionRepo.wipeUnstagedForSession(session.sessionId)

      // REQ-SESS-10: retain session as audit history iff at least one commit was recorded;
      //              else delete the session row entirely.
      const commitCount = await sessionRepo.countCommitsForSession(session.sessionId)
      if (commitCount === 0) {
        await sessionRepo.deleteSession(session.sessionId)
      } else {
        await sessionRepo.markSessionEnded(session.sessionId)   // status: ACTIVE → ENDED
      }

      await uow.commit()
      return Result.ok({
        sessionId: session.sessionId,
        projectId: session.projectId,
        sessionMode: session.mode,
        summary: commitCount > 0
          ? `Session ended with ${commitCount} commit(s). ${wipedCount} unstaged change(s) discarded. Session retained as audit history.`
          : `Session ended with no commits. ${wipedCount} unstaged change(s) discarded. Session record removed.`,
      })
    } catch (err) {
      await uow.rollback()
      throw err
    }
  }
}
```

`SessionResult` type shape matches the existing `SessionResponseDto`:
```ts
type SessionResult = {
  sessionId:   number
  projectId:   string
  sessionMode: SessionMode
  summary:     string
}
```

### 7b.3 `ISessionRepository` port (`@arc/core`) — new

```ts
export interface ISessionRepository {
  // Session lookup — SessionGuard uses the composite; handlers use the two-step form
  // to distinguish "project not found" (404) from "no active session" (a valid pre-create state).
  findActiveSessionByProjectId(projectId: string): Promise<ProjectSession | null>
  findFileSystemIdByProjectId(projectId: string): Promise<number | null>
  findActiveSessionByFileSystemId(fileSystemId: number): Promise<ProjectSession | null>

  createSession(row: {
    fileSystemId: number, clientId: string, sessionMode: SessionMode, userId: string | null,
  }): Promise<number>   // returns new sessionId

  countCommitsForSession(sessionId: number): Promise<number>
  deleteSession(sessionId: number): Promise<void>            // cascades to edit_actions + session_entity_versions via FK
  markSessionEnded(sessionId: number): Promise<void>          // status: ACTIVE → ENDED + endedAt: NOW

  // REQ-SESS-09 wipe of UNSTAGED rows on end-session.
  // Adapter runs the DELETE inline (see §7b.3 adapter note).
  wipeUnstagedForSession(sessionId: number): Promise<number>   // rows affected
}
```

Adapter in `@arc/persistence`: straightforward TypeORM. The `wipeUnstagedForSession` implementation runs the delete directly — `DELETE FROM edit_actions WHERE session_id = ? AND change_status = 'UNSTAGED'` — no delegation to another persistence service. `EditActionsQueryService` remains pure-read (§11) per `docs/read-overlay-design.md` — not exposed via UoW.

### 7b.4 Interaction with `SessionGuard`

- `StartSessionCommand` endpoint (`POST /projects/:id/start-session`) — **no `@UseGuards(SessionGuard)`**. Starting a session doesn't require an existing session.
- `EndSessionCommand` endpoint (`POST /projects/:id/end-session`) — **DOES have `@UseGuards(SessionGuard)`**. Ending a nonexistent session should 403.

### 7b.5 Cleanup on end-session — order matters

`deleteSession` cascades to `edit_actions` and `session_entity_versions` via existing FK constraints (ON DELETE CASCADE on `session_id`). No manual delete needed for these tables. The explicit `wipeUnstagedForSession(sessionId)` call in the handler is defensive — even if we go through the retain-as-audit path, unstaged rows are wiped (REQ-SESS-09).

Applied STAGED rows on committed sessions are already deleted by the commit path (LLD4 concern). Superseded rows (`validUntil IS NOT NULL`) remain if the session is retained as audit history — they represent the session's write history and can be truncated by a separate audit-retention policy later if needed.

---

## 8. `WriteContext` and Session Hand-Off (Pattern A)

### 8.1 Types — `ActiveSession` and `WriteContext`

Two plain TS types in core:

```
type ActiveSession = {
  sessionId:    number
  mode:         SessionMode
  fileSystemId: number
  projectId:    string          // for audit/error context
}

type WriteContext = {
  session: ActiveSession
  groupId: string               // stamped by CommandBus
}
```

- `ActiveSession` — call-boundary input; populated by `SessionGuard` from the DB, passed to `CommandBus.execute()`.
- `WriteContext` — ambient in-request state; held on `UnitOfWork`; consumed by handlers, edit repos, and `PendingChangeWriter`.

- `source` is NOT on `WriteContext`. It moves per-write via the options bag on edit-repo methods (§9). Rationale: nested services within one request (diff-stager, auto-routing runner) produce writes with different sources than the outer handler; mid-request mutation of a shared source field would be error-prone.

### 8.2 Session hand-off flow (Pattern A)

Explicit hand-off, no NestJS request-scope leakage into core. Note: every URL uses `{projectId}` (not `fileSystemId`) — the `projectId → fileSystemId` mapping is a query concern handled by the session-query port, not by the caller.

```
1. Client → HTTP request to /arc-api/v1/projects/{projectId}/...
2. SessionGuard (@arc/api):
     Reads projectId from request params.
     Queries active session via ISessionRepository.findActiveSessionByProjectId(projectId).
       Adapter resolves projectId → fileSystemId internally, joins project_sessions where status=ACTIVE.
     No active session → 403.
     Attaches to request:  request.arcSession = { sessionId, mode, fileSystemId, projectId }.  // ActiveSession
3. Controller:
     Reads request.arcSession.
     Builds command:  cmd = new SetModuleAliasCommand(...)
     Calls:           commandBus.execute(cmd, request.arcSession)
4. CommandBus (@arc/core):
     Reads command.constructor.requiresSession and .allowedModes.
     if requiresSession && !session → throws SessionRequiredError.
     if session && allowedModes has entries && !allowedModes.includes(session.mode) → throws SessionModeNotAllowedError.
     Creates UoW.
     if session → uow.setWriteContext({ session, groupId: uuidv4() })   // Case-3 skips this
     Invokes handler. (No transaction started by the bus — handler owns it. See §7a.4.)
5. Handler (@arc/core):
     Starts transaction (single-tx handler) OR opens multiple transactions across phases (multi-phase handler).
     Calls edit repo methods — passes only uow and domain args.
     Commits on success / rolls back on failure.
6. Edit repo adapter (@arc/persistence):
     Reads WriteContext from uow — uses ctx.session.sessionId, ctx.session.mode, ctx.groupId.
     Writes via PendingChangeWriter.
```

- SessionGuard does the one session lookup (via a port that also resolves projectId → fileSystemId).
- CommandBus does no re-query.
- Edit repos do no re-query — they consume WriteContext from UoW.
- Read APIs follow the same projectId pattern (existing behavior). The `projectId → fileSystemId` resolution port is shared between read paths (existing query services) and the SessionGuard.

### 8.3 `groupId` stamping

- CommandBus generates UUID at `execute()` time, after the mode check passes.
- Stamped into `WriteContext` before handler invocation.
- Same value on every row produced within the call — atomic handle for undo/redo/stage/unstage.

### 8.4 CommandBus signature

Core port shape:

```
interface CommandBus {
  // session is optional: Case-3 commands (requiresSession = false) are dispatched without one.
  // CommandBus enforces the pairing per §7a.3.
  execute<T extends BaseCommand>(
    command: T,
    session?: ActiveSession,
  ): Promise<CommandResult<T>>
}
```

- Controller responsible for populating `session` from `request.arcSession`.
- No dependency on NestJS in core — `ActiveSession` is a plain TS type.
- CommandBus internally constructs `WriteContext = { session, groupId: uuidv4() }` and puts it on UoW.

### 8.5 `UnitOfWork` extensions

New accessors on the UoW port (`@arc/core`):

```
interface UnitOfWork {
  // existing: startTransaction, commit, rollback, ...

  setWriteContext(ctx: WriteContext): void       // called by CommandBus once
  getWriteContext(): WriteContext                  // called by edit-repo adapters
  getSessionRepository(): ISessionRepository      // called by session-lifecycle handlers (§7b)

  applyCachedActions(): Promise<void>              // called by handler before commit
}
```

Implementation on `TypeOrmUnitOfWork` in persistence.

> **Architecture note — `getQueryRunner()` is deliberately absent from the core port.**
> Persistence-layer services (`PendingChangeWriter`, aggregate edit-repo adapters) that need a
> `QueryRunner` receive it via constructor injection from `TypeOrmUnitOfWork.getQueryRunner()` —
> a method that exists only on the persistence adapter, not on the core `UnitOfWork` interface.
> Adding `getQueryRunner()` to the core port would import a TypeORM type into `@arc/core`,
> violating the hexagonal rule that core must have zero infrastructure imports.

---

## 9. `PendingChangeWriter` (`@arc/persistence`)

Low-level service that writes rows to the `edit_actions` table. Called by aggregate edit repos (LLD2+), not by handlers directly.

**Note for execution — no existing service to replace.** Earlier design docs (`docs/superpowers/specs/2026-06-11-modification-framework-design.md`, `docs/modification-framework/modification-framework-design.md`) sketched an "EntityStagingService" but no implementation ever landed in the codebase — search under `packages/` returns doc-only hits. LLD1 delivers `PendingChangeWriter` as a fresh implementation. The naming choice (`PendingChangeWriter` instead of `EntityStagingService`) reflects that this service records pending changes; it does not perform staging (the `changeStatus = STAGED` flip). Whether rows are STAGED or UNSTAGED depends on the caller's `source` + session mode (§9.6).

### 9.1 Interface

```
writeDelta(spec: WriteDeltaSpec,   sessionId: number, groupId: string, qr: QueryRunner): Promise<void>
writeCreate(spec: WriteCreateSpec, sessionId: number, groupId: string, qr: QueryRunner): Promise<void>
writeDelete(spec: WriteDeleteSpec, sessionId: number, groupId: string, qr: QueryRunner): Promise<void>
```

`PendingChangeWriter` does not accept a `UnitOfWork` parameter. Callers (aggregate edit-repo adapters in `@arc/persistence`) extract `sessionId` and `groupId` from `uow.getWriteContext()` (core interface — fine), and obtain `qr` from `TypeOrmUnitOfWork.getQueryRunner()` (persistence-adapter method — also fine, no core boundary crossed), then pass all three explicitly.

**Spec shapes:**

```
WriteDeltaSpec  = { targetTable, targetSystemId, aggregateId, fieldGroup?, newValue, source,
                    changeStatus?: ChangeStatus, cache? }

WriteCreateSpec = { targetTable, targetSystemId, aggregateId, newValue, source,
                    changeStatus?: ChangeStatus, cache? }
                // changeStatus honored only when source = DIFF_TOOL (REQ-EA-05 revised).
                // MANUAL CREATE is always STAGED; AUTO_ROUTING CREATE is always UNSTAGED.
                // Omit for default DIFF_TOOL behaviour (UNSTAGED).

WriteDeleteSpec = { targetTable, targetSystemId, aggregateId, source, cache? }
```

`mode` is derived by the writer from the session context it keeps — not on the spec.

### 9.2 Accumulator merge (fieldGroup = null)

- Fetch current active row for `(sessionId, targetSystemId, fieldGroup=null)`.
- If found: merge new delta keys into existing payload → new payload.
- If not found: attempt baseVersion capture (§9.5).
- Supersede prior row (set `validUntil = NOW`).
- Insert new row with merged payload.

### 9.3 Per-slot supersession (fieldGroup ≠ null)

- Fetch current active row for `(sessionId, targetSystemId, fieldGroup)`.
- No merge — new value replaces prior.
- Supersede prior row.
- Insert new row.

### 9.4 CREATE + CREATE-then-modify (REQ-EA-10c)

- CREATE row with `fieldGroup = "$"`, `operation = CREATE`, `newValue` = full payload.
- Subsequent modifications on the same entity: write on other fieldGroups (or accumulator).
- baseVersion never captured for session-created entities (REQ-EA-12).

### 9.5 baseVersion capture (`session_entity_versions`)

- Before writing an UPDATE/DELETE on a committed entity, attempt `INSERT OR IGNORE` into `session_entity_versions` with `entity_table.version`.
- No-op if a row already exists for `(sessionId, targetSystemId)` — REQ-EA-13 capture-once.
- Session-created entities skip this step entirely.

### 9.6 changeStatus determination

Derived at write time from `source` + `mode` + optional caller override:

| Source | Mode | changeStatus |
|---|---|---|
| MANUAL | DESIGNER | `STAGED` |
| MANUAL | DIFF_MERGE | `STAGED` (REQ-SESS-12) |
| DIFF_TOOL | DIFF_MERGE | Caller-provided if `options.changeStatus` set; otherwise defaults to `UNSTAGED` (REQ-EA-05 revised — tool may configure to write `STAGED` directly per apply-diff call) |
| AUTO_ROUTING | DESIGNER | `UNSTAGED` (REQ-EA-05 — auto-routing does not support override) |

Options bag on edit-repo methods gains one optional field for the DIFF_TOOL override:

```
options?: {
  fieldGroup?, linkedEntityGroupId?, cache?, source?,
  changeStatus?: "STAGED" | "UNSTAGED"   // honored only when source = DIFF_TOOL
}
```

`PendingChangeWriter` enforces:
- `MANUAL` writes with any explicit `options.changeStatus` are rejected — MANUAL is always STAGED.
- `AUTO_ROUTING` writes with any explicit `options.changeStatus` are rejected — AUTO_ROUTING is always UNSTAGED.
- `DIFF_TOOL` writes honor `options.changeStatus` when provided; default UNSTAGED otherwise.

In practice, the diff-stager sets `changeStatus` uniformly across all rows produced in one apply-diff call — the setting comes from a per-call configuration (e.g., request body flag on `POST /diff-merge/apply`), not per-field.

### 9.7 Cached bulk mode (`cache = true`)

- Row is appended to `PendingChangeCache` buffer (§10) instead of INSERTed.
- baseVersion capture is also queued for bulk resolution.
- Only valid for non-accumulator fieldGroups (accumulator needs read-modify-write on every SET and can't defer).

---

## 10. `PendingChangeCache` and `applyCachedActions()`

UoW-scoped in-memory buffer used for bulk write paths (DiffMerge apply, auto-routing) where individual INSERT-per-row would be too slow. **This is a persistence-internal class, not a core port** — core interacts with the cache only through `uow.applyCachedActions()`. `PendingChangeWriter` holds the cache directly and calls its enqueue methods; no core-facing use exists.

### 10.1 Persistence-internal interface

```
// packages/infrastructure/persistence — no core interface, class only
class PendingChangeCache {
  enqueueRow(row: PendingChangeInsert): void
  enqueueBaseVersionCapture(target: { targetTable, targetSystemId }): void

  size(): number
  isEmpty(): boolean
}

// on UnitOfWork (core port):
applyCachedActions(): Promise<void>   // performs the flush described in §10.2
```

`PendingChangeInsert` is a persistence-shaped row insert spec. `PendingChangeWriter` constructs these when `cache: true`.

### 10.2 Flush algorithm

`applyCachedActions()` performs, in order:

```
1. baseVersion capture batch:
   - Group queued targets by targetTable (targets are {targetTable, targetSystemId}
     tuples enqueued by PendingChangeWriter; one target per entity regardless of
     how many field_paths that entity has pending — session_entity_versions has
     exactly one row per (sessionId, targetSystemId), enforced by composite PK).
   - For each table group, one SELECT fetches current versions:
       SELECT system_id, version FROM <table> WHERE system_id IN (<targets>)
   - Assemble (sessionId, targetSystemId, baseVersion) tuples from the results.
   - INSERT OR IGNORE INTO session_entity_versions VALUES (...), (...), ... —
     chunked to 500-1000 tuples per statement to stay under SQLite's parameter
     limit (SQLITE_MAX_VARIABLE_NUMBER, default ~500). Multiple INSERT statements
     if the total exceeds the chunk size, all inside the same transaction.

2. pending row INSERT batch:
   - Enqueued rows are already per-field_path — a single entity with N pending
     field_paths contributes N rows to this batch.
   - Multi-row INSERT INTO edit_actions (...) VALUES (...), (...), ... — same
     chunking rule as above (500-1000 rows per statement).

3. Clear both buffers on success.
```

Two independent concerns baked into that algorithm:
- **Grouping by table** (step 1) — for SELECT efficiency, one query per table instead of one per entity.
- **Chunking per INSERT statement** (both steps) — for DB statement-size limits, orthogonal to grouping.

Failures propagate to the enclosing transaction — rollback disposes the buffer implicitly.

Example — a 5000-change DiffMerge apply spanning ~2000 distinct entities across 5 tables produces roughly: 5 SELECTs (one per table) + ~4 INSERTs to `session_entity_versions` (2000 tuples chunked) + ~10 INSERTs to `edit_actions` (5000 rows chunked) = ~19 SQL round-trips instead of 5000 without batching.

### 10.3 Lifecycle

- One `PendingChangeCache` instance per UoW (per request).
- `PendingChangeWriter` calls `enqueueRow()` when caller passes `cache: true`.
- Handler is responsible for calling `uow.applyCachedActions()` after all writes are queued and **before** `uow.commit()`. Order in the handler:
  ```
  await stager.stage(compareResult, uow)   // enqueues rows
  await uow.applyCachedActions()            // flushes
  // (CommandBus completes with commit)
  ```
- If a handler queues writes but never calls `applyCachedActions()`, the transaction still commits successfully but the queued rows are silently dropped — an implementation bug. LLD1 will surface this via a UoW-level assertion or a warning-log at commit time.

### 10.4 Constraints

- `cache = true` is invalid for accumulator writes (`fieldGroup = null`). Accumulator needs read-modify-write on every SET and cannot defer. Enforced in `PendingChangeWriter` — rejects with a runtime error.
- `cache = true` is invalid for CREATE-then-modify sequences that depend on reading prior rows within the same call. Diff-apply and auto-routing don't hit this because they write once per fieldPath.

---

## 11. `EditActionsQueryService` (`@arc/persistence`)

Raw pending-change reads. No overlay merge, no domain shaping, no mutations — pure read side of `edit_actions`. Rewritten from the existing service to reflect the new schema and to add source-filtering methods. Delete operations on `edit_actions` live with the callers that own the business purpose (session-lifecycle wipe → `TypeOrmSessionRepository`; DiffMerge idempotent re-apply → `DiffMergeApplyService` in LLD6a).

### 11.1 Interface

```
interface EditActionsQueryService {
  // Fetch active pending rows
  getByAggregateId(
    sessionId: number,
    aggregateId: number,
    options?: EditActionsQueryOptions,
  ): Promise<EditActionRow[]>

  getByAggregateAndTable(
    sessionId: number,
    aggregateId: number,
    targetTable: EntityName,
    options?: EditActionsQueryOptions,
  ): Promise<EditActionRow[]>

  getByTable(
    sessionId: number,
    targetTable: EntityName,
    options?: EditActionsQueryOptions,
  ): Promise<EditActionRow[]>

  getBySource(
    sessionId: number,
    source: Source,
    options?: EditActionsQueryOptions,
  ): Promise<EditActionRow[]>

  // Session-scoped supersession lookup (used by PendingChangeWriter)
  findCurrentRow(
    sessionId: number,
    targetSystemId: number,
    fieldPath: string | null,
  ): Promise<EditActionRow | null>
}
```

Session lookup (`findActiveSession`) is **not** on this service — session queries belong to `ISessionRepository` (§7b.3). Delete methods (`deleteByStatus`, `deleteBySource`) are **not** on this service — see the caller-owned locations above.

### 11.2 `EditActionsQueryOptions`

```
type EditActionsQueryOptions = {
  operations?:   ChangeOperation[]   // filter by op; default: all
  changeStatus?: ChangeStatus        // filter by status; default: both STAGED + UNSTAGED
  source?:       Source              // filter by source; default: all
}
```

All queries filter `valid_until IS NULL` implicitly — active rows only. No option to widen this at LLD1; historical rows are only needed for undo/redo (deferred).

### 11.3 Row-type mapping

- `EditActionRow` TypeScript interface reflects the new columns (see §5.1). Owned by persistence, imported by the service impl.
- Consumers of the row shape are inside persistence only (read-service adapters, `PendingChangeWriter`). Core never sees `EditActionRow`.

### 11.4 Concurrency

- All queries run against the current UoW's `queryRunner` when called during a transaction, or against the shared `DataSource` for read-only usage from persistence-internal read-service adapters (LLD3+).

---

## 12. `OverlayMerge` (`@arc/persistence`)

Pure in-memory fold utility. Given committed rows + active pending rows for an aggregate scope, produces effective rows with optional diff context. No DB access. Reusable across every aggregate's read-service adapter (LLD3+).

### 12.1 Interface

```
interface OverlayMerge {
  // Merge N pending rows onto one base row.
  // Returns the effective row + per-field diff entries.
  // Returns null if the effective state is a tombstone (final row was DELETE
  // and there was no CREATE-then-DELETE cancellation).
  applyToSingle<T extends { systemId: number }>(
    baseRow: T | null,             // null when the entity is being CREATEd in-session
    pendingRows: EditActionRow[],
  ): OverlayResult<T> | null

  // Merge pending rows onto a collection of base rows.
  // - Rows targeting existing base entities → merged as in applyToSingle.
  // - CREATE rows for entities absent from baseRows → produce new virtual rows.
  // - DELETE rows → excluded from the returned array (tombstoned).
  applyToCollection<T extends { systemId: number }>(
    baseRows: T[],
    pendingRows: EditActionRow[],
  ): OverlayResult<T>[]
}

type OverlayResult<T> = {
  effective: T                       // committed + pending applied
  diffEntries: DiffEntry[]           // per-field diff context (§8 of overall-design)
  /**
   * Absent when the entity has no pending changes (operation = NONE).
   * PARTIAL arises when the entity has a mix of STAGED and UNSTAGED rows.
   */
  pendingChangeStatus?: PendingChangeStatus
  /**
   * NONE   — entity has no pending changes (committed base row, no edits).
   * CREATE — entity was created in this session.
   * UPDATE — entity has pending field changes on a committed base.
   * DELETE never appears — tombstoned entities cause applyToSingle to return
   *         null and applyToCollection to exclude. Callers never see DELETE.
   */
  operation: Exclude<ChangeOperation, typeof CHANGE_OPERATION.Delete>
}

type DiffEntry = {
  fieldName: string                  // for element paths: full tree path e.g., "elements[stereoEq].elements[left]"
  oldValue: unknown | null           // null for CREATE
  newValue: unknown | null           // null for DELETE
  changeId: number
  groupId: string
  linkedEntityGroupId: string | null
  changeStatus: ChangeStatus
  source: Source
}
```

### 12.2 Fold algorithm

For each targetSystemId (single entity or one entry in a collection):

```
1. Group pending rows by targetSystemId (collection case; single case has one group).
2. Sort by (createdAt ASC, changeId ASC).
3. Start with effective = deep-clone(baseRow) (or {} if base is null and there's a CREATE).
4. For each pending row in sort order:
     - Look up dispatch case by row.fieldPath shape (via FieldPathReducer):
       - scalar column name → effective[fieldPath] = row.newValue
       - "$" or multi-key JSON payload → for each key k in row.newValue: effective[k] = row.newValue[k]
       - element path e.g., "elements[gain]" or "elements[stereoEq].elements[left]"
                → parse effective's serialized column into the typed element tree
                  (ConfigElement / StructElement / ElementArray / StructArray —
                   see `element-definition.ts` in @arc/core),
                  navigate the tree by path, replace at target node, re-serialize
       - null (accumulator) → same as multi-key JSON payload; payload holds all merged fields
     - Record diff entry per touched field (fieldName, oldValue, newValue, and metadata).
     - Handle operation:
       - CREATE → mark operation for the whole result; effective is the created row.
       - UPDATE → default operation; effective diverges from base per field.
       - DELETE → set tombstone; discard effective; return null (or exclude in collection case).
5. Compute pendingChangeStatus from the set of pending row statuses:
     - no pending rows → operation = NONE; pendingChangeStatus = undefined (absent)
     - all STAGED → "STAGED"
     - all UNSTAGED → "UNSTAGED"
     - mix → "PARTIAL"
6. Return OverlayResult (or null for tombstone).
```

### 12.3 `FieldPathReducer`

**Role:** applies a single pending change row to an effective-state object, dispatching on the row's `fieldPath` shape. `OverlayMerge` calls it once per row inside its fold loop.

Analogy: if `OverlayMerge` is like `Array.reduce(callback, initial)`, then `FieldPathReducer.applyRow` is the `callback` — takes `(accumulator, row)`, mutates accumulator. Dispatch on `row.fieldPath` decides HOW.

Factored out from `OverlayMerge` because:
- **Testability** — each fieldPath shape gets independent unit tests without spinning up the fold loop.
- **Locality** — element-path handling needs a type-aware parser/navigator/re-serializer that's non-trivial; keeping it in its own module keeps `OverlayMerge` slim.
- **Extensibility** — new serialized-column types register additional reducer cases via `(targetTable, columnName)` keys.
- **Reuse at commit time** — the Commit LLD can reuse the same dispatch logic to translate pending rows into partial-UPDATE SQL against entity tables, keeping commit and read overlay consistent.

```
interface FieldPathReducer {
  applyRow(effective: Record<string, unknown>, row: EditActionRow): void
  deriveDiffEntries(row: EditActionRow, baseRow: Record<string, unknown> | null): DiffEntry[]
}
```

**Dispatch table (on `row.fieldPath`):**

| `fieldPath` value | Action |
|---|---|
| scalar column name (e.g., `"alias"`) | `effective[fieldPath] = row.newValue`; one diff entry `{fieldName: fieldPath, oldValue: baseRow?.[fieldPath], newValue}` |
| `"$"` (whole-row replacement) | For each key `k` in `row.newValue`: `effective[k] = row.newValue[k]`; one diff entry per key |
| `null` (accumulator) | Same as `"$"` — payload is a multi-key JSON object |
| Custom named group (e.g., `"identity"`) | Same as `"$"` — payload is a multi-key JSON object; server treats the name as opaque |
| Element path (e.g., `"elements[gain]"`, `"elements[stereoEq].elements[left]"`, `"elements[channels][0].doa"`) | Path expression through the `elementsStructure` tree. Reducer parses `effective["elements_structure"]` (the serialized column identified in the reducer registry) into the typed element tree, navigates by the path, replaces at the target node with `row.newValue`, re-serializes. One diff entry `{fieldName: <path>, oldValue: <prior node>, newValue: row.newValue}`. Path syntax + navigation logic are LLD6c-owned. |

The reducer registry maps `(entity kind, structured-column name)` to a parse/navigate/serialize triple. In Phase 1 the registry has no entries — no serialized-column entities are in edit scope. LLD6c registers the ParameterDefinition entry.

### 12.4 CREATE / DELETE handling

- **CREATE**: row's `fieldPath = "$"` and `operation = CREATE`. The reducer treats it as a base for subsequent rows. Effective row starts empty; the CREATE row fills it. Subsequent UPDATE-style rows on the same entity apply on top.
- **DELETE**: row's `operation = DELETE`. Returns null (single case) or excludes (collection case). If a DELETE follows a CREATE on the same entity — CREATE-then-DELETE cancellation — the fold recognizes this and returns null.

### 12.5 Extensibility

- New fieldPath shapes: add a case in `FieldPathReducer`. Element-path reducers register per (targetTable, columnName).
- New collection semantics (e.g., array-of-objects at a nested path): extend the reducer registry.

---

### 12.6 Interfaces

- `applyToSingle<T>(baseRow, editActions[])` — merge N rows onto one base row.
- `applyToCollection<T>(baseRows, editActions[])` — group by systemId, apply per group; CREATE actions produce new virtual rows.

### 12.7 Diff context output

- Every changed field surfaces as a diff entry with `{ fieldName, oldValue, newValue, changeId, groupId, status, source, linkedEntityGroupId? }`.
- Consumed by read-service adapters to populate `diffEntity` on entity DTOs (LLD3).

---

## 13. Commit — Deferred

The commit service (ordering, apply logic, error-to-`ValidationIssue` mapping, auto-generated commit description, partial-success policy) is deferred to a dedicated Commit LLD outside LLD1.

Overall Design §9 records the direction — commit is hand-written per entity kind, with domain-aware error messages and auto-summaries. A CI-time FK-consistency check may accompany it as a safety net. See §15 of overall-design for LLD sequencing.

LLD1 provides only the foundation the commit service will build on: `edit_actions` + `session_entity_versions` schemas, `PendingChangeWriter` for writes, `EditActionsQueryService` for reads, `OverlayMerge` for effective-state computation. It does NOT ship the commit service itself.


---

## 14. `UnitOfWork` Extensions

- New port methods added to `packages/core/.../unit-of-work.ts`:
  - `setWriteContext(ctx: WriteContext): void`                    // called once by CommandBus (§8.5)
  - `getWriteContext(): WriteContext`
  - `applyCachedActions(): Promise<void>`
  - `getSessionRepository(): ISessionRepository`                  // §7b — session lifecycle
- Existing methods on `UnitOfWork` (`startTransaction`, `commit`, `rollback`) are unchanged. Transaction lifecycle stays with handlers (§7a.4).
- `TypeOrmUnitOfWork` implements — instantiates `PendingChangeCache` (persistence-internal) per request and wires it into `PendingChangeWriter`.
- CommandBus populates WriteContext before invoking handler.

---

## 15. File Layout

Full folder tree of files created or modified by this LLD.

- `packages/core/src/application/shared/change-vocabulary.ts` — add `SOURCE` const + type, `PENDING_CHANGE_STATUS` const + `PendingChangeStatus` type (§6.2).
- `packages/core/src/application/orchestration/cqrs/base-command.ts` — extend with `static readonly requiresSession: boolean = true` and `static readonly allowedModes: readonly SessionMode[] = []`.
- `packages/core/src/application/orchestration/cqrs/command-bus.ts` — accept optional `ActiveSession` on `execute()`; add session-required check + mode check before `startTransaction()`; construct `WriteContext = { session, groupId: uuidv4() }` and put on UoW **only when a session is present**; throw `SessionRequiredError` / `SessionModeNotAllowedError` on mismatch.
- `packages/core/src/application/orchestration/cqrs/active-session.ts` — new `ActiveSession` type.
- `packages/core/src/application/orchestration/cqrs/write-context.ts` — new `WriteContext = { session: ActiveSession, groupId: string }`.
- `packages/core/src/application/orchestration/cqrs/errors.ts` — new `SessionRequiredError` + `SessionModeNotAllowedError` (or extend existing error module).
- `packages/core/src/application/edit-session/start-session/start-session.command.ts` + `.handler.ts` — §7b.
- `packages/core/src/application/edit-session/end-session/end-session.command.ts` + `.handler.ts` — §7b.
- `packages/core/src/application/ports/persistence/repositories/session/session.repository.ts` — new `ISessionRepository` port (§7b).
- `packages/core/src/application/ports/persistence/unit-of-work.ts` — extend with `setWriteContext()`, `getWriteContext()`, `applyCachedActions()`.
- `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/edit-session/edit-action.schema.ts` — reshape.
- `.../entity-schema/edit-session/session-entity-version.schema.ts` — new.
- `.../queries/edit-session/edit-actions-query-service.ts` — rewrite.
- `.../queries/edit-session/overlay-merge.ts` — rewrite.
- `.../queries/edit-session/field-path-reducer.ts` — new.
- `.../repositories/session/typeorm-session.repository.ts` — new adapter for `ISessionRepository` (§7b). Serves both SessionGuard lookups and session-lifecycle handlers.
- `.../services/pending-change-writer.ts` — new (§9). No existing service to supersede; earlier design docs referenced an "EntityStagingService" but no implementation ever landed.
- `.../services/pending-change-cache.ts` — new persistence-internal class (not a core port; held by `PendingChangeWriter`, flushed via `uow.applyCachedActions()`).
- `.../unit-of-work/typeorm-unit-of-work.ts` — extend with WriteContext + cache accessors.
- `packages/api/src/guards/session-guard.ts` — new (active-session resolution only; uses `ISessionRepository` port).
- `packages/api/src/filters/session-mode-not-allowed.filter.ts` — new (maps `SessionModeNotAllowedError` to 403).
- `packages/api/src/filters/session-required.filter.ts` — new (maps `SessionRequiredError` to 403).
- `packages/api/src/module/session-wiring-check.ts` — new (boot-time cross-check per §7a.7; asserts SessionGuard presence matches `requiresSession` for every registered command endpoint).
- Migration file — regenerated `initial-create`.

---

## 16. Testing Strategy

### 16.1 Unit tests (`packages/core`, `packages/infrastructure/persistence`)

- `PendingChangeWriter`: accumulator merge, per-slot supersession, CREATE-then-modify, cached bulk write, changeStatus determination from source + mode.
- `PendingChangeCache`: flush with mixed baseVersion captures + inserts; empty-cache no-op.
- `OverlayMerge` + `FieldPathReducer`: each fieldPath shape, CREATE/UPDATE/DELETE semantics, fold order determinism, diff context production.

### 16.2 Integration tests (`packages/infrastructure/persistence/tests/integration`)

- In-memory SQLite with the new schema.
- End-to-end: staging + query + overlay merge across an aggregate.
- baseVersion capture through the side-table.
- `TypeOrmSessionRepository.wipeUnstagedForSession` — inline DELETE removes only UNSTAGED rows for the target session; STAGED and superseded rows untouched.

### 16.3 E2E (`packages/api/tests/e2e`)

- `SessionGuard` behavior — 403 for missing/inactive session on Case-1/2 endpoints.
- `CommandBus` behavior — 403 for wrong-mode (Case 1) via `SessionModeNotAllowedError`; 403 for missing session on `requiresSession = true` command via `SessionRequiredError`; Case-3 command succeeds without a session.
- End-to-end write → read overlay cycle with an existing SET handler stub (or deferred to LLD2 if no handlers land in LLD1).

---

## 17. Migration & Rollout Notes

- Existing pending edit-actions in dev databases are discarded on migration regeneration — no data preservation.
- Any references to the old `payload` column in old query services need to be updated in later LLDs — LLD1 flags them but doesn't rewrite (LLD3 rewrites the module read side).
- Session Guard applies to endpoints wired with `@UseGuards(SessionGuard)`. Endpoints without it (e.g., pure read endpoints) are unaffected. Mode enforcement rolls out per command as commands declare their `static readonly allowedModes` field — commands with the empty default (`[]`) work in any mode until updated.

---

## 18. Open Questions

- Enumerate any decisions deliberately deferred to LLD execution phase.
- Cross-cutting questions that surface during content fill.

---

*End of Outline*
