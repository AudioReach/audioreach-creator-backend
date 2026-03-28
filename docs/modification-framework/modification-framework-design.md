<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Modification Framework: Design Document

**Related Documents:**
- `modification-framework-testing.md` — Testing strategy
- `../entity-id-generation.md` — Entity ID generation scheme (composite integers, reserve-block pattern)

---

## 1) Context & Goals

### Deployment Context

**Current deployment**: This server runs on the **same machine** as the client applications. It is a local IPC (inter-process communication) server, not a networked service. Multiple processes on the same machine — the graph designer UI, MATLAB toolboxes, module tuner apps — all communicate with this server over localhost HTTP.

**Future deployment**: A true multi-machine server with multiple concurrent users is a planned but distant future concern. The API is designed stateless so that it can be extended to a networked deployment without architectural changes. Multi-user implementation is **not required now** and is explicitly out of scope for the current phase.

### Business Goals

The Modification Framework enables transactional editing of AudioReach graph designer projects across multiple local client processes:

1. **Multi-Process Editing**: Multiple local client applications share the same edit session on the same machine
2. **Mode-Gated Operations**: Each session mode restricts which operations are permitted; invalid operations return `403 Forbidden`
3. **Staged Workflow**: User-initiated changes are automatically staged; algorithm-generated changes (e.g., auto-routing) require explicit user review before commit
4. **Transactional Commits**: All-or-nothing commit semantics; committed changes are applied to actual tables and removed from the pending layer
5. **Commit Audit Log**: Every `commit-changes` call is recorded with a commit message; users can review the history of what was committed in a session
6. **Restore Points**: User-requested snapshots for undo/redo and experimentation
7. **Edit-Aware Reads**: Query services transparently overlay pending changes on committed data

### Non-Functional Requirements

| NFR | Priority | Target | Notes |
|-----|----------|--------|-------|
| **Consistency** | Critical | ACID transactions; optimistic locking | Core requirement |
| **Performance** | High | <500ms per edit operation | Local SQLite; no network latency |
| **Extensibility** | Medium | Stateless API; all state in DB | Enables future networked deployment |
| **Usability** | High | Clear staging/commit UX; mode-based guidance | Primary concern for local tool |

> **Note on multi-user**: The data model includes `user_id` on `project_sessions` and a unique constraint per user per file. This is a forward-compatible design hook — it costs nothing now and avoids a schema migration when multi-user support is added. No multi-user enforcement logic needs to be implemented in the current phase.

---

## 2) Architecture Overview

### High-Level Component Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│              Local Client Applications (same machine)             │
│   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐        │
│   │ Graph Designer│   │ Module Tuner │   │ MATLAB App   │        │
│   └──────┬───────┘   └──────┬───────┘   └──────┬───────┘        │
└──────────┼───────────────────┼───────────────────┼───────────────┘
           └───────────────────┴───────────────────┘
                               │  HTTP/REST (localhost)
┌──────────────────────────────┼───────────────────────────────────┐
│              packages/api (NestJS)                                │
│                                                                   │
│   REST Controllers → DTOs + Validation → SessionModeGuard         │
│   Infrastructure Wrappers (Logger, Filters, UoW)                  │
└──────────────────────────────┬───────────────────────────────────┘
                               │
┌──────────────────────────────┼───────────────────────────────────┐
│              packages/core (Application + Domain)                 │
│                                                                   │
│   CQRS Orchestration (CommandBus / QueryBus)                      │
│                                                                   │
│   Session Commands:          Edit-Aware Queries:                  │
│   • StartSession             • GetModules (with overlay)          │
│   • EndSession               • GetSubgraph (with overlay)         │
│   • CommitChanges            • GetLinks (with overlay)            │
│   • StageChanges                                                  │
│   • UnstageChanges                                                │
│   • DiscardChanges                                                │
│   • AutoCreateUsecases                                            │
│   • AddModule / UpdateModule / DeleteModule                       │
│                                                                   │
│   Ports: IProjectSessionRepository, ISessionCommitRepository,     │
│          IEditActionRepository, IRestorePointRepository,          │
│          IVersionChecker, IdGenerationPort                        │
└──────────────────────────────┬───────────────────────────────────┘
                               │
┌──────────────────────────────┼───────────────────────────────────┐
│              packages/infrastructure/persistence                   │
│                                                                   │
│   Aggregate Edit Repositories (Module, Subgraph, Definition)      │
│   EditActionsService (common DB writes)                           │
│   EntityIdServiceRegistry (IdGenerationPort implementation)       │
│   TypeORM Schemas: files, project_sessions, session_commits,      │
│                    edit_actions, restore_points, spf_modules, ... │
│   SQLite Database                                                 │
└───────────────────────────────────────────────────────────────────┘
```

### Key Architectural Patterns

| Pattern | Where | Purpose |
|---------|-------|---------|
| CQRS | `packages/core` | Write model is `edit_actions`; read model is actual tables + overlay |
| Hexagonal / Ports & Adapters | All packages | Domain core has zero infrastructure dependencies |
| Mode-Gated Operations | `packages/api` guard | `SessionModeGuard` validates every edit request |
| Optimistic Locking | `edit_actions.base_version` | Conflict detection at commit time |
| Temporal Versioning | `edit_actions.valid_until` | Undo/redo without deletion |

---

## 3) Data Design

### Entity IDs

All entity primary keys are **composite integers** pre-assigned by `IdGenerationPort` before any database write. See `../entity-id-generation.md` for the full scheme, bit layout, capacity analysis, and infrastructure implementation.

### Entity-Relationship Diagram

```
files (system_id PK, last_entity_id, ...)
  │
  ├─── 1:N ──► project_sessions (session_id PK, file_system_id FK)
  │                │
  │                ├─── 1:N ──► session_commits (commit_id PK, session_id FK)
  │                │
  │                └─── 1:N ──► edit_actions (change_id PK, session_id FK)
  │
  └─── 1:N ──► restore_points (system_id PK, file_system_id FK,
                                session_id FK nullable → project_sessions)
```

### Table Schemas

#### `project_sessions`

```sql
CREATE TABLE project_sessions (
  session_id     INTEGER      PRIMARY KEY,
  file_system_id INTEGER      NOT NULL,
  user_id        VARCHAR(255),            -- NULL in current single-user phase; reserved for future
  client_id      VARCHAR(255) NOT NULL,
  session_mode   VARCHAR(20)  NOT NULL
    CHECK (session_mode IN ('TUNING', 'DESIGNER', 'DISCOVERY_WIZARD', 'DIFF_MERGE')),
  status         VARCHAR(10)  NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'ENDED')),
  started_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at       TIMESTAMP,
  FOREIGN KEY (file_system_id) REFERENCES files(system_id) ON DELETE CASCADE
);

-- One active session per file (single-user phase: user_id = NULL)
-- Forward-compatible: when user_id is populated, enforces one active session per user per file
CREATE UNIQUE INDEX uq_project_sessions_one_active_per_file
  ON project_sessions(file_system_id)
  WHERE status = 'ACTIVE';

CREATE INDEX idx_project_sessions_file   ON project_sessions(file_system_id);
CREATE INDEX idx_project_sessions_status ON project_sessions(status);
```

**READ-ONLY mode** is the absence of an ACTIVE `project_sessions` row for a given file. No separate table or column is needed.

**Enums:**
```typescript
export const SESSION_MODE = {
  Tuning: 'TUNING',
  Designer: 'DESIGNER',
  DiscoveryWizard: 'DISCOVERY_WIZARD',
  DiffMerge: 'DIFF_MERGE',
} as const;

export const SESSION_STATUS = {
  Active: 'ACTIVE',
  Ended: 'ENDED',
} as const;
```

#### `session_commits`

```sql
CREATE TABLE session_commits (
  commit_id      INTEGER      PRIMARY KEY,
  session_id     INTEGER      NOT NULL,
  commit_message TEXT         NOT NULL,
  committed_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  change_count   INTEGER      NOT NULL DEFAULT 0,
  FOREIGN KEY (session_id) REFERENCES project_sessions(session_id) ON DELETE CASCADE
);

CREATE INDEX idx_session_commits_session ON session_commits(session_id);
```

#### `edit_actions`

```sql
CREATE TABLE edit_actions (
  change_id     INTEGER      PRIMARY KEY,
  system_id     INTEGER      NOT NULL,   -- ID of the target entity
  aggregate_id  INTEGER      NOT NULL DEFAULT 0, -- ID of the aggregate root
  session_id    INTEGER      NOT NULL,
  table_name    VARCHAR(100) NOT NULL,
  operation     VARCHAR(10)  NOT NULL
    CHECK (operation IN ('NONE', 'CREATE', 'UPDATE', 'DELETE')),
  payload       TEXT         NOT NULL,   -- JSON: full entity for CREATE, Partial<T> for UPDATE, {} for DELETE
  change_status VARCHAR(20)  NOT NULL DEFAULT 'STAGED'
    CHECK (change_status IN ('UNSTAGED', 'STAGED')),
  base_version  INTEGER,                 -- NULL for ADD operations
  group_id      TEXT,                    -- groups related changes (e.g., module + its ports)
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  valid_until   TIMESTAMP,               -- NULL = current; set when superseded by a newer change
  FOREIGN KEY (session_id) REFERENCES project_sessions(session_id) ON DELETE CASCADE
);

CREATE INDEX idx_edit_actions_session
  ON edit_actions(session_id);

CREATE INDEX idx_edit_actions_entity_active
  ON edit_actions(session_id, system_id)
  WHERE valid_until IS NULL;

CREATE INDEX idx_edit_actions_table_active
  ON edit_actions(session_id, table_name)
  WHERE valid_until IS NULL;

CREATE INDEX idx_edit_actions_agg_active
  ON edit_actions(session_id, aggregate_id)
  WHERE valid_until IS NULL;

CREATE INDEX idx_edit_actions_status_active
  ON edit_actions(session_id, change_status)
  WHERE valid_until IS NULL;

-- One current version per entity per session
CREATE UNIQUE INDEX uniq_edit_actions_current
  ON edit_actions(session_id, system_id)
  WHERE valid_until IS NULL;
```

**Column notes:**
- `system_id`: ID of the entity being changed. Pre-assigned by `IdGenerationPort`.
- `aggregate_id`: ID of the aggregate root. For a module's property, `aggregate_id` = the module's `system_id`. For a top-level entity, `aggregate_id` = its own `system_id`. Enables efficient aggregate-scoped reads without scanning payload JSON.
- `valid_until`: Set to `NOW()` when a newer version of the same change supersedes this row. Supports undo/redo without deletion.

**Enums:**
```typescript
export const CHANGE_OPERATION = {
  None:   'NONE',
  Create: 'CREATE',
  Update: 'UPDATE',
  Delete: 'DELETE',
} as const;

export const CHANGE_STATUS = {
  Staged:   'STAGED',
  Unstaged: 'UNSTAGED',
} as const;
```

#### `restore_points`

```sql
CREATE TABLE restore_points (
  system_id      INTEGER      PRIMARY KEY,
  session_id     INTEGER,                -- nullable FK
  file_system_id INTEGER      NOT NULL,
  restore_type   VARCHAR(20)  NOT NULL
    CHECK (restore_type IN ('EDIT_SNAPSHOT', 'FULL_SNAPSHOT')),
  snapshot_data  TEXT         NOT NULL,  -- JSON
  description    TEXT,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES project_sessions(session_id) ON DELETE CASCADE,
  FOREIGN KEY (file_system_id) REFERENCES files(system_id) ON DELETE CASCADE
);

CREATE INDEX idx_restore_points_session ON restore_points(session_id);
CREATE INDEX idx_restore_points_file    ON restore_points(file_system_id);
```

**Enum:**
```typescript
export const RESTORE_TYPE = {
  EditSnapshot: 'EDIT_SNAPSHOT',
  FullSnapshot: 'FULL_SNAPSHOT',
} as const;
```

### Indexing Strategy

| Index | Table | Purpose |
|-------|-------|---------|
| `uq_project_sessions_one_active_per_file` | `project_sessions` | One active session per file |
| `idx_project_sessions_file` | `project_sessions` | Lookup sessions by file |
| `idx_session_commits_session` | `session_commits` | List all commits in a session |
| `idx_edit_actions_session` | `edit_actions` | Fetch all changes in a session |
| `idx_edit_actions_entity_active` | `edit_actions` | Lookup active change for a specific entity |
| `idx_edit_actions_agg_active` | `edit_actions` | Fetch all active changes for an aggregate root |
| `idx_edit_actions_status_active` | `edit_actions` | Filter by change status |
| `uniq_edit_actions_current` | `edit_actions` | One current version per entity per session |

---

## 4) Session Modes & Operation Permissions

| Mode | Description | Permitted Operations |
|------|-------------|---------------------|
| **READ-ONLY** | Default; no active session | Read APIs only |
| **TUNING** | Calibration and parameter tuning | Read + Tuning/Calibration + Change Management |
| **DESIGNER** | Full design and configuration | Read + Tuning + Designer + Change Management |
| **DISCOVERY_WIZARD** | Import and discovery | Read + Import/Discovery + Change Management |
| **DIFF_MERGE** | Comparison and merging | Read + Tuning + Designer + Diff/Merge + Change Management |

**READ-ONLY mode** is the absence of an ACTIVE `project_sessions` row for a given file. No separate table or column is needed.

A `SessionModeGuard` in `packages/api` intercepts every edit request, checks the active session for the file, and returns `403 Forbidden` if the operation is not permitted in the current mode.

---

## 5) Session Lifecycle

### Session Status Transitions

```
[READ-ONLY]  ← default; no active project_sessions row for this file
     │
     │  POST /start-session { mode: "TUNING", clientId: "ModuleTuner" }
     ▼
  [ACTIVE]
     │
     ├──► POST /commit-changes  → session_commits row created; STAGED edit_actions deleted
     │    (session remains ACTIVE; UNSTAGED edit_actions remain)
     │
     └──► POST /end-session
               │
               ├── has commits → status = ENDED  (kept as audit)
               └── no commits  → row deleted
                                  [READ-ONLY]
```

### Start Session

```
POST /arcapi/v1/projects/:projectId/start-session
Body: { mode: "TUNING", clientId: "ModuleTuner" }
```

```typescript
async handle(command: StartSessionCommand): Promise<StartSessionResult> {
  const existing = await this.sessionRepo.findActiveSession(command.fileId);
  if (existing) throw new SessionAlreadyActiveException(existing.sessionId);

  await this.idPort.reserveBlock(command.fileId);

  const sessionId = this.idPort.getNextId(command.fileId);
  const session = await this.sessionRepo.create({
    sessionId,
    fileId:      command.fileId,
    clientId:    command.clientId,
    sessionMode: command.mode,
    status:      'ACTIVE',
  });

  return { sessionId: session.sessionId, mode: session.sessionMode };
}
```

### Commit Changes

```
POST /arcapi/v1/projects/:projectId/commit-changes
Body: { commitMessage: "Added playback module" }
```

```typescript
async handle(command: CommitChangesCommand): Promise<CommitResult> {
  const session = await this.sessionRepo.findActiveSession(command.fileId);

  // 1. Conflict detection
  const conflicts = await this.detectConflicts(session.sessionId);
  if (conflicts.length > 0) throw new VersionConflictException(conflicts);

  // 2. Apply STAGED edit_actions to actual tables
  const committedCount = await this.applyChanges(session.sessionId);

  // 3. Delete committed edit_actions
  await this.editActionRepo.deleteByStatus(session.sessionId, 'STAGED');

  // 4. Record commit
  const commitId = this.idPort.getNextId(command.fileId);
  await this.commitRepo.create({
    commitId,
    sessionId:     session.sessionId,
    commitMessage: command.commitMessage,
    changeCount:   committedCount,
  });

  // 5. Reclaim unused ID block tail
  await this.idRegistry.persistActual(command.fileId, queryRunner);

  return { committedChanges: committedCount };
}
```

UNSTAGED `edit_actions` remain in the table, still pointing to the active `project_sessions` row.

### End Session

```
POST /arcapi/v1/projects/:projectId/end-session
Body: { commitMessage: "Session complete" }
```

```typescript
async handle(command: EndSessionCommand): Promise<EndSessionResult> {
  const session = await this.sessionRepo.findActiveSession(command.fileId);

  // 1. Commit all remaining STAGED changes
  const committedCount = await this.applyChanges(session.sessionId);
  if (committedCount > 0) {
    await this.editActionRepo.deleteByStatus(session.sessionId, 'STAGED');
    const commitId = this.idPort.getNextId(command.fileId);
    await this.commitRepo.create({
      commitId,
      sessionId:     session.sessionId,
      commitMessage: command.commitMessage ?? 'Session ended',
      changeCount:   committedCount,
    });
  }

  // 2. Delete all UNSTAGED and DISCARDED edit_actions
  await this.editActionRepo.deleteAllPending(session.sessionId);

  // 3. Reclaim unused ID block tail
  await this.idRegistry.persistActual(command.fileId, queryRunner);

  // 4. Close or remove the session
  const hasCommits = (await this.commitRepo.countBySession(session.sessionId)) > 0;
  if (hasCommits) {
    await this.sessionRepo.markEnded(session.sessionId);
  } else {
    await this.sessionRepo.delete(session.sessionId);
  }

  return { status: 'ENDED' };
}
```

---

## 6) Payload Strategy

### Payload by Operation Type

**ADD** — full entity with pre-assigned ID:
```typescript
const moduleId = this.idPort.getNextId(fileId);

const payload: SpfModule = {
  systemId:           moduleId,
  alias:              'NewModule',
  definitionSystemId: 456,
  subgraphSystemId:   789,
  containerSystemId:  101,
  version:            1,
};
```

**UPDATE** — only changed fields:
```typescript
const payload: Partial<SpfModule> = { alias: 'RenamedModule' };
```

**DELETE** — empty payload (entity identified by `system_id` column):
```typescript
const payload = {};
```

### Read Overlay

Port implementations in `persistence` use `EditActionsQueryService` to fetch pending changes and `OverlayMerge` to merge them with base rows from actual tables. See `read-overlay-design.md` for the full pattern.

---

## 7) Repository Architecture

### `EditActionRow` Type

```typescript
export interface EditActionRow {
  changeId:     number;
  systemId:     number;
  aggregateId:  number;
  sessionId:    number;
  tableName:    EntityName;       // from ENTITY_NAMES in entity-table-names.ts
  operation:    ChangeOperation;  // from CHANGE_OPERATION in change-vocabulary.ts
  payload:      unknown;          // JSON (simple-json TypeORM type)
  changeStatus: ChangeStatus;     // from CHANGE_STATUS in change-vocabulary.ts
  baseVersion:  number | null;
  groupId:      string | null;
  createdAt:    Date;
  validUntil:   Date | null;
  session?:     ProjectSessionRow;
}
```

### Common `EditActionsService`

```typescript
export class EditActionsService {
  constructor(private readonly queryRunner: QueryRunner) {}

  async insertEditAction(row: EditActionRow): Promise<void> {
    // Supersede any existing current version for this entity
    await this.queryRunner.manager
      .createQueryBuilder()
      .update(ENTITY_NAMES.EditAction)
      .set({validUntil: new Date()})
      .where('sessionId = :sessionId AND systemId = :systemId AND validUntil IS NULL', {
        sessionId: row.sessionId,
        systemId:  row.systemId,
      })
      .execute();
    await this.queryRunner.manager.insert(ENTITY_NAMES.EditAction, row);
  }

  async getCurrentVersion(tableName: EntityName, systemId: number): Promise<number | null> {
    const result = await this.queryRunner.manager
      .createQueryBuilder()
      .select('t.version', 'version')
      .from(tableName, 't')
      .where('t.systemId = :systemId', {systemId})
      .getRawOne<{version: number}>();
    return result?.version ?? null;
  }
}
```

### Aggregate-Specific Edit Repositories

Each aggregate has its own repository encapsulating domain knowledge (cascade logic, payload shape). Example:

```typescript
@Injectable()
export class ModuleEditRepository {
  constructor(private readonly editActionsService: EditActionsService) {}

  async stageModuleCreate(module: SpfModule, sessionId: number): Promise<void> {
    await this.editActionsService.insertEditAction({
      changeId:     this.idPort.getNextId(module.fileSystemId),
      systemId:     module.systemId,
      aggregateId:  module.systemId,
      sessionId,
      tableName:    ENTITY_NAMES.SpfModule,
      operation:    CHANGE_OPERATION.Create,
      payload:      JSON.stringify(module),
      changeStatus: 'STAGED',
      baseVersion:  null,
      groupId:      null,
      createdAt:    new Date(),
      validUntil:   null,
    });
  }

  async stageModuleDelete(module: SpfModule, sessionId: number): Promise<void> {
    const groupId = generateUuid();

    for (const property of module.properties) {
      await this.editActionsService.insertEditAction({
        changeId:     this.idPort.getNextId(module.fileSystemId),
        systemId:     property.systemId,
        aggregateId:  module.systemId,
        sessionId,
        tableName:    ENTITY_NAMES.SpfModulePropertiesData,
        operation:    CHANGE_OPERATION.Delete,
        payload:      '{}',
        changeStatus: 'STAGED',
        baseVersion:  property.version,
        groupId,
        createdAt:    new Date(),
        validUntil:   null,
      });
    }

    await this.editActionsService.insertEditAction({
      changeId:     this.idPort.getNextId(module.fileSystemId),
      systemId:     module.systemId,
      aggregateId:  module.systemId,
      sessionId,
      tableName:    ENTITY_NAMES.SpfModule,
      operation:    CHANGE_OPERATION.Delete,
      payload:      '{}',
      changeStatus: 'STAGED',
      baseVersion:  module.version,
      groupId,
      createdAt:    new Date(),
      validUntil:   null,
    });
  }
}
```

---

## 8) Workflow / Processes

### DESIGNER Mode — End-to-End

```
POST /start-session { mode: "DESIGNER", clientId: "GraphDesigner" }
  → reserveBlock(fileId)
  → sessionId = getNextId(fileId)
  → INSERT project_sessions (session_id=sessionId, status=ACTIVE, session_mode=DESIGNER)

POST /modules-instance { definitionSystemId: 456, alias: "Mod1" }
  → moduleId = idPort.getNextId(fileId)
  → INSERT edit_actions (change_id=getNextId(), system_id=moduleId, operation=CREATE, change_status=STAGED)
  → HTTP 201 { systemId: 8388613 }

POST /data-links { sourceModuleId: 8388613, ... }
  → linkId = idPort.getNextId(fileId)
  → INSERT edit_actions (change_id=getNextId(), operation=CREATE, change_status=STAGED)
  → HTTP 201 { systemId: 8388621 }

POST /auto-create-usecases
  → Run routing algorithm on STAGED edit_actions only
  → INSERT generated usecases as UNSTAGED edit_actions
  → HTTP 200 { generatedUsecases: [...] }

POST /stage-changes { changeIds: [8388629, 8388637] }
  → UPDATE edit_actions SET change_status=STAGED WHERE change_id IN (...)

POST /commit-changes { commitMessage: "Added playback module" }
  → Conflict detection (base_version check)
  → Apply STAGED edit_actions to actual tables
  → DELETE STAGED edit_actions
  → commitId = getNextId(fileId)
  → INSERT session_commits (commit_id=commitId, change_count=2)
  → persistActual(fileId, queryRunner)
  → HTTP 200 { committedChanges: 2 }

POST /end-session
  → No remaining STAGED changes
  → DELETE all UNSTAGED edit_actions
  → UPDATE project_sessions SET status=ENDED
  → HTTP 200 { status: "ENDED" }
```

### Commit Orchestration (Apply Changes)

```typescript
// Process in topological order within a single transaction:
// a. DELETEs (reverse dependency order)
// b. UPDATEs (any order)
// c. ADDs    (forward dependency order)

for (const action of sortedActions) {
  const payload = JSON.parse(action.payload);
  switch (action.operation) {
    case CHANGE_OPERATION.Create:
      await queryRunner.manager.insert(action.tableName, payload);
      break;
    case CHANGE_OPERATION.Update:
      await queryRunner.manager.update(action.tableName, { systemId: action.systemId }, payload);
      break;
    case CHANGE_OPERATION.Delete:
      await queryRunner.manager.delete(action.tableName, { systemId: action.systemId });
      break;
  }
}
```

---

## 9) Undo/Redo via Version Activation

### Concept

The `edit_actions` table stores the full version history of every pending change within a session. `valid_until IS NULL` marks the current version of each entity's pending change. Older versions have `valid_until` set to the timestamp when they were superseded.

**The server is a passive versioned store.** The client maintains its own undo/redo stack of `change_id` values and tells the server which version to make current.

### DB Operations for Activate Change

```typescript
async activateChange(changeId: number, sessionId: number): Promise<void> {
  await this.queryRunner.startTransaction();
  try {
    const target = await this.queryRunner.manager.findOne(ENTITY_NAMES.EditAction, {
      where: {changeId, sessionId},
    });
    if (!target) throw new NotFoundException(`change_id ${changeId} not found in session`);

    // Supersede the current version of this entity
    await this.queryRunner.manager
      .createQueryBuilder()
      .update(ENTITY_NAMES.EditAction)
      .set({validUntil: new Date()})
      .where('sessionId = :sessionId AND systemId = :systemId AND validUntil IS NULL', {
        sessionId,
        systemId: target.systemId,
      })
      .execute();

    // Make the target version current
    await this.queryRunner.manager
      .createQueryBuilder()
      .update(ENTITY_NAMES.EditAction)
      .set({validUntil: null})
      .where('changeId = :changeId', {changeId})
      .execute();

    await this.queryRunner.commitTransaction();
  } catch (err) {
    await this.queryRunner.rollbackTransaction();
    throw err;
  }
}
```

### Undo/Redo Scenarios

#### Scenario A: Multiple calibration versions, then undo

```
After three updates to module M's calibration:
  C4 | system_id=8388613 | UPDATE | cal v1 | valid_until=T1  (superseded)
  C5 | system_id=8388613 | UPDATE | cal v2 | valid_until=T2  (superseded)
  C6 | system_id=8388613 | UPDATE | cal v3 | valid_until=NULL (current)

Client undoes → POST /activate-change { changeId: C5 }
  → C6.valid_until = NOW()
  → C5.valid_until = NULL  (current — cal v2)

Client redoes → POST /activate-change { changeId: C6 }
  → C5.valid_until = NOW()
  → C6.valid_until = NULL  (current — cal v3)
```

#### Scenario B: Undo an ADD (entity disappears)

```
C1 | system_id=8388613 | CREATE | {module M} | valid_until=NULL

Client undoes → POST /deactivate-change { changeId: C1 }
  → C1.valid_until = NOW()  (no current version → entity absent from overlay)

Client redoes → POST /activate-change { changeId: C1 }
  → C1.valid_until = NULL  (entity reappears)
```

---

## 10) Performance

### SQLite Optimizations

```typescript
// Enable WAL mode at startup for concurrent reads during writes
await dataSource.query('PRAGMA journal_mode=WAL');
await dataSource.query('PRAGMA synchronous=NORMAL');
```

### Bottleneck Analysis

| Bottleneck | Mitigation |
|-----------|-----------|
| SQLite single-writer | WAL mode; batch inserts at commit |
| Read overlay (scanning edit_actions) | `idx_edit_actions_agg_active` for aggregate-scoped reads |
| Commit (bulk inserts) | Reserve ID block upfront; build object graph in memory; single transaction |
| ID generation | In-memory block; no DB call per entity |

---

## 11) Architecture Decision Records (ADRs)

### ADR-001: `project_sessions` + `session_commits` (Two-Table Model)

**Decision**: `project_sessions` tracks session lifecycle (one per `start-session`). `session_commits` tracks commit history (one per `commit-changes`). `edit_actions` FK to `project_sessions`.

**Rationale**: Maps directly to the API (`start-session` / `end-session` / `commit-changes`). Clean separation: session lifecycle vs. commit audit log. Future mode-specific tables (e.g., `diff_results` for DIFF_MERGE) FK to `project_sessions`.

**Status**: Accepted

---

### ADR-002: Explicit Session Start

**Decision**: Editing requires an explicit `POST /start-session?mode=...`. No auto-creation on first edit.

**Rationale**: Mode must be known before any edit operation (for mode validation). Implicit creation would require inferring the mode from the operation, which is ambiguous.

**Status**: Accepted

---

### ADR-003: Optimistic Locking via `base_version`

**Decision**: Capture `baseVersion` on first Update/Delete per entity per session. Compare at commit time.

**Consequences**: All entity tables require a `version` column (INTEGER, incremented on each UPDATE).

**Status**: Accepted

---

### ADR-004: `aggregate_id` Column on `edit_actions`

**Decision**: Add `aggregate_id` alongside `system_id`.

**Rationale**: Enables efficient "fetch all changes for this aggregate" queries without scanning payload JSON. Critical for read overlay of nested entities (e.g., module properties).

**Status**: Accepted

---

### ADR-005: Forward-Compatible Multi-User Design

**Decision**: Include `user_id` on `project_sessions` and a partial unique index on `(file_system_id) WHERE status = 'ACTIVE'`. In the current phase, `user_id` is NULL and the index enforces one active session per file.

**Future behavior**: When multi-user is implemented, `user_id` will be populated and the index updated to `(file_system_id, user_id) WHERE status = 'ACTIVE'` — enforcing per-user isolation without a data migration.

**Status**: Accepted

---

### ADR-006: `auto-create-usecases` as Separate API

**Decision**: Usecase generation is a separate explicit `POST /auto-create-usecases` call, not embedded in the commit flow.

**Rationale**: Client controls when to run the algorithm; generated usecases are inserted as UNSTAGED for user review; decouples routing logic from commit atomicity.

**Status**: Accepted

---

### ADR-007: Client-Managed Undo/Redo Stack

**Decision**: The server stores all versions of pending changes (via `valid_until`) but does not maintain an undo/redo stack. The client tracks `change_id` values and calls `/activate-change` or `/deactivate-change` to navigate history.

**Rationale**: Keeps the server stateless with respect to undo/redo position. The client can reconstruct its stack from the version history on crash recovery.

**Status**: Accepted

---

## 12) Citations

| Reference | Used For |
|-----------|---------|
| NestJS docs — Guards | `SessionModeGuard` implementation |
| NestJS docs — CQRS Module | Command/query bus patterns |
| TypeORM docs — Transactions, QueryRunner | Unit of Work, commit orchestration |
| RFC 9110 (HTTP Semantics) | Status codes |
| Twelve-Factor App | Environment-driven config; stateless processes |
| OWASP Top 10 | Input validation, injection prevention |

---

*End of Document*
