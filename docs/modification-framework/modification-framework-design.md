# Modification Framework: Design Document

## Document Information
- **Version**: 2.0
- **Date**: December 2025
- **Status**: Final Design
- **Author**: Nithin Simon

**Related Documents:**
- `modification-framework-testing.md` - Testing strategy
- `modification-framework-logging.md` - Logging architecture

---

## 1) Context & Goals

### Business Goals
The Modification Framework enables collaborative, transactional editing of AudioReach graph designer projects with the following capabilities:

1. **Multi-Client Editing**: Single user can operate multiple specialized client applications (e.g., graph designer, module tuner) simultaneously, all sharing the same edit session
2. **Optimistic Concurrency**: Multiple users can work on the same project; conflicts detected at commit time via version checking
3. **Staged Workflow**: User-initiated changes are automatically staged; algorithm-generated changes (e.g., auto-routing) require user review before commit
4. **Transactional Commits**: All-or-nothing commit semantics with automatic usecase generation for graph topology changes
5. **Restore Points**: User-requested snapshots for undo/redo and experimentation
6. **Edit-Aware Reads**: Query services transparently overlay pending changes on committed data

### Non-Functional Requirements (NFRs)

| NFR | Priority | Target | Notes |
|-----|----------|--------|-------|
| **Consistency** | Critical | ACID transactions | Optimistic locking, version-based conflict detection |
| **Availability** | High | 99.5% uptime | Stateless API, session state in DB |
| **Performance** | Medium | <500ms edit operations | Acceptable degradation for read overlay in DiffMerge scenarios |
| **Scalability** | Medium | 10 concurrent editors/project | SQLite limitations; future migration to PostgreSQL |
| **Usability** | High | Clear staging/commit UX | Visual diff indicators, conflict resolution guidance |

### Constraints
- **Database**: SQLite (current); must support future migration to PostgreSQL/MySQL
- **Architecture**: Existing NestJS + TypeORM + CQRS patterns in `audioreach-creator-api` monorepo
- **Stateless API**: No server-side session state beyond database
- **Backward Compatibility**: Existing read-only query services must continue to work
- **SystemId Strategy**: Use GUID (UUID) for pending entities in edit_actions; map to auto-generated integer IDs at commit time
- **Session Management**: One active session per user per project; implicit session handling (no client-side session IDs)

### Assumptions
1. Edit sessions are typically short-lived (minutes to hours, not days)
2. Most edit operations affect <100 entities per transaction
3. DiffMerge edit type may create 1000+ pending changes (acceptable performance impact)
4. Users understand optimistic locking and will handle commit conflicts
5. Automatic usecase generation algorithm is deterministic (same graph → same usecases)
6. One user cannot have multiple active sessions per project simultaneously
7. Clients do not manage session IDs; backend handles session lifecycle implicitly

### Module Mapping
This framework spans multiple bounded contexts:

| Bounded Context | Modules Affected | Edit Operations |
|----------------|------------------|-----------------|
| **Graph Designer** | `usecase`, `subgraph`, `module-instance`, `container` | Add/Update/Delete modules, links, subgraphs |
| **Link Management** | `data-link`, `control-link` | Add/Update/Delete connections |
| **Calibration** | `module-instance` (properties) | Update module calibration data (SetCalData) |
| **Project Management** | `project` | Session lifecycle, restore points |

---

## 2) Architecture Overview

### High-Level Component Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Client Applications                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ Graph Designer│  │ Module Tuner │  │ Diff Viewer  │              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
│         │                  │                  │                       │
│         └──────────────────┴──────────────────┘                      │
│                            │                                          │
│                    HTTP/REST (JSON)                                  │
└────────────────────────────┼────────────────────────────────────────┘
                             │
┌────────────────────────────┼────────────────────────────────────────┐
│                  packages/api (NestJS)                               │
│                            │                                          │
│  ┌─────────────────────────▼──────────────────────────────┐         │
│  │         REST Controllers (Presentation Layer)           │         │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │         │
│  │  │ Module   │ │ DataLink │ │ Subgraph │ │ Session  │  │         │
│  │  │Controller│ │Controller│ │Controller│ │Controller│  │         │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘  │         │
│  └───────┼────────────┼────────────┼────────────┼─────────┘         │
│          │            │            │            │                    │
│  ┌───────▼────────────▼────────────▼────────────▼─────────┐         │
│  │           DTOs & Validation (class-validator)           │         │
│  └───────┬────────────┬────────────┬────────────┬─────────┘         │
│          │            │            │            │                    │
│  ┌───────▼────────────▼────────────▼────────────▼─────────┐         │
│  │        Infrastructure Wrappers & Middleware             │         │
│  │  • Request Logger  • Exception Filters                  │         │
│  │  • Unit of Work (TypeORM)  • Session Context Injection  │         │
│  └───────┬────────────┬────────────┬────────────┬─────────┘         │
└──────────┼────────────┼────────────┼────────────┼───────────────────┘
           │            │            │            │
┌──────────▼────────────▼────────────▼────────────▼───────────────────┐
│                  packages/core (Application + Domain)                │
│                                                                       │
│  ┌────────────────────────────────────────────────────────┐         │
│  │              CQRS Orchestration Layer                  │         │
│  │  ┌──────────────────┐      ┌──────────────────┐       │         │
│  │  │   Command Bus    │      │    Query Bus     │       │         │
│  │  └────────┬─────────┘      └────────┬─────────┘       │         │
│  └───────────┼──────────────────────────┼─────────────────┘         │
│              │                          │                            │
│  ┌───────────▼──────────────┐  ┌───────▼──────────────────┐        │
│  │   Edit Commands          │  │  Edit-Aware Queries      │        │
│  │  • AddModuleCommand      │  │  • GetModulesQuery       │        │
│  │  • UpdateModuleCommand   │  │  • GetSubgraphQuery      │        │
│  │  • DeleteModuleCommand   │  │  • GetLinksQuery         │        │
│  │  • StageChangesCommand   │  │  (with read overlay)     │        │
│  │  • CommitSessionCommand  │  │                          │        │
│  │  • RejectChangesCommand  │  │                          │        │
│  │  • CreateRestoreCommand  │  │                          │        │
│  └───────────┬──────────────┘  └───────┬──────────────────┘        │
│              │                          │                            │
│  ┌───────────▼──────────────────────────▼──────────────────┐       │
│  │              Command/Query Handlers                      │       │
│  │  • Session Management  • Change Tracking                 │       │
│  │  • Validation  • Conflict Detection                      │       │
│  └───────────┬──────────────────────────┬──────────────────┘       │
│              │                          │                            │
│  ┌───────────▼──────────────────────────▼──────────────────┐       │
│  │              Domain Services & Entities                  │       │
│  │  • EditSession (Aggregate)  • EditAction (Entity)        │       │
│  │  • Module, Subgraph, Link entities (existing)            │       │
│  │  • Version conflict detection logic                      │       │
│  └───────────┬──────────────────────────┬──────────────────┘       │
│              │                          │                            │
│  ┌───────────▼──────────────────────────▼──────────────────┐       │
│  │                  Ports (Interfaces)                      │       │
│  │  • IEditSessionRepository  • IEditActionRepository       │       │
│  │  • IRestorePointRepository • IVersionChecker             │       │
│  └───────────┬──────────────────────────┬──────────────────┘       │
└──────────────┼──────────────────────────┼────────────────────────────┘
               │                          │
┌──────────────▼──────────────────────────▼────────────────────────────┐
│         packages/infrastructure/persistence (TypeORM + SQLite)        │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────┐        │
│  │         Aggregate-Specific Edit Repositories             │        │
│  │  • ModuleEditRepository                                  │        │
│  │  • SubgraphEditRepository                                │        │
│  │  • ModuleDefinitionEditRepository                        │        │
│  │  (Each knows its aggregate structure)                    │        │
│  └───────────┬──────────────────────────┬───────────────────┘        │
│              │                          │                             │
│  ┌───────────▼──────────────────────────▼───────────────────┐        │
│  │              EditActionsService (Common)                 │        │
│  │  • Generic insert/update/delete for edit_actions table  │        │
│  │  • No domain knowledge                                   │        │
│  │  • Reusable across all aggregates                        │        │
│  └───────────┬──────────────────────────┬───────────────────┘        │
│              │                          │                             │
│  ┌───────────▼──────────────────────────▼───────────────────┐        │
│  │              Read Overlay Service                        │        │
│  │  • Merges pending changes with actual data              │        │
│  │  • Caching layer for performance                         │        │
│  └───────────┬──────────────────────────┬───────────────────┘        │
│              │                          │                             │
│  ┌───────────▼──────────────────────────▼───────────────────┐        │
│  │                  TypeORM Entity Schemas                   │        │
│  │  • edit_sessions  • edit_actions  • restore_points        │        │
│  │  • spf_modules, data_links, etc. (existing tables)        │        │
│  └───────────┬──────────────────────────┬───────────────────┘        │
│              │                          │                             │
│  ┌───────────▼──────────────────────────▼───────────────────┐        │
│  │                    SQLite Database                        │        │
│  │  • ACID transactions  • Auto-increment systemIds          │        │
│  │  • Foreign key constraints  • Unique constraints          │        │
│  └───────────────────────────────────────────────────────────┘        │
└───────────────────────────────────────────────────────────────────────┘
```

### Unit of Work Integration

```
┌─────────────────────────────────────────────────────────────┐
│                    Command Handler                           │
│  UpdateModuleAliasCommandHandler                             │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Transaction Middleware                          │
│  • Creates UoW                                               │
│  • Starts transaction (creates QueryRunner)                  │
│  • Passes UoW to handler                                     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    Unit of Work                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  QueryRunner (shared)                                   │ │
│  └────────────────────────────────────────────────────────┘ │
│                         │                                    │
│         ┌───────────────┼───────────────┐                   │
│         │               │               │                   │
│         ▼               ▼               ▼                   │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ Regular  │  │EditActions   │  │ Edit Repos   │         │
│  │ Repos    │  │Service       │  │ (Module,     │         │
│  │          │  │(uses QR)     │  │  Subgraph)   │         │
│  └──────────┘  └──────────────┘  └──────────────┘         │
│                         ▲                  │                │
│                         └──────────────────┘                │
│                         (Edit repos use service)            │
└─────────────────────────────────────────────────────────────┘
```

**Key Points**:
1. **EditActionsService** created inside UoW with shared QueryRunner
2. **Aggregate-specific edit repositories** receive EditActionsService from UoW
3. **All operations share same transaction** via QueryRunner
4. **Transaction middleware** handles commit/rollback
5. **Clean separation** between domain logic and infrastructure

### Key Architectural Patterns

#### 1. **CQRS (Command Query Responsibility Segregation)**
- **Commands**: All edit operations (Add/Update/Delete) go through command bus
- **Queries**: Read operations use query bus with edit-aware overlay logic
- **Separation**: Write model (edit_actions) separate from read model (actual tables + overlay)

#### 2. **Hexagonal Architecture (Ports & Adapters)**
- **Domain Core** (`packages/core`): Pure business logic, no infrastructure dependencies
- **Ports**: Interfaces for persistence, session management, version checking
- **Adapters**: TypeORM implementations in `packages/infrastructure/persistence`

#### 3. **Optimistic Locking**
- **Version Tracking**: `baseVersion` captured on first Update/Delete per entity during session
- **Conflict Detection**: At commit time, compare `baseVersion` with current version in actual table
- **Resolution**: Reject commit if versions mismatch; user must refresh and retry

#### 4. **Event Sourcing (Lightweight)**
- **Edit Actions as Events**: Each change recorded as immutable event in `edit_actions` table
- **Replay**: Read overlay reconstructs current state by applying events to base data
- **Audit Trail**: Complete history of changes within session

#### 5. **Aggregate-Specific Repositories**
- **ModuleEditRepository**: Knows SpfModule aggregate structure
- **SubgraphEditRepository**: Knows Subgraph aggregate structure
- **ModuleDefinitionEditRepository**: Knows ModuleDefinition aggregate structure
- **Benefits**: Domain knowledge encapsulated, maintainable, testable

---

## 3) Data Design

### Entity-Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         session_modes                                │
├─────────────────────────────────────────────────────────────────────┤
│ PK  mode_id               VARCHAR(36)                                │
│ FK  file_system_id        INTEGER       -- FK to arc_db_files        │
│     mode                  ENUM('DESIGNER','DIFF_MERGE','SIMULATION') │
│     deactivated_at        TIMESTAMP     -- NULL if active            │
│     created_at            TIMESTAMP     -- Activation time           │
└─────────────────────────────────────────────────────────────────────┘
                │
                │ 1:N
                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         edit_sessions                                │
├─────────────────────────────────────────────────────────────────────┤
│ PK  session_id            VARCHAR(36)                                │
│     user_id               VARCHAR(255)  -- Nullable                  │
│     client_id             VARCHAR(255)  -- Client app identifier     │
│ FK  file_system_id        INTEGER       -- FK to arc_db_files        │
│ FK  mode_id               VARCHAR(36)   -- FK to session_modes       │
│     edit_status           ENUM('ACTIVE','COMMITTED')                 │
│     committed_at          TIMESTAMP     -- NULL if active            │
│     commit_message        TEXT          -- NULL if not committed     │
│     created_at            TIMESTAMP                                  │
└─────────────────────────────────────────────────────────────────────┘
                │                                    │
                │ 1:N                                │ 1:N
                ▼                                    ▼
┌───────────────────────────────┐    ┌───────────────────────────────┐
│       edit_actions            │    │      restore_points           │
├───────────────────────────────┤    ├───────────────────────────────┤
│ PK  change_id                 │    │ PK  restore_id                │
│     system_id                 │    │ FK  session_id (nullable)     │
│ FK  session_id                │    │ FK  file_system_id            │
│     table_name                │    │     restore_type              │
│     operation                 │    │     snapshot_data             │
│     payload                   │    │     description               │
│     change_status             │    │     created_at                │
│     base_version              │    │     system_id                 │
│     group_id                  │    │     updated_at                │
│     created_at                │    │     version                   │
│     valid_until               │    └───────────────────────────────┘
├───────────────────────────────┤
│ IDX idx_edit_actions_session  │
│ IDX idx_edit_actions_system_id│
│ IDX idx_edit_actions_valid    │
│ IDX idx_edit_actions_status   │
│ UNIQUE uniq_edit_actions_...  │
└───────────────────────────────┘
```

### Table Schemas

#### session_modes
```sql
CREATE TABLE session_modes (
  mode_id VARCHAR(36) PRIMARY KEY,
  file_system_id INTEGER NOT NULL,
  mode VARCHAR(20) NOT NULL CHECK (mode IN ('DESIGNER', 'DIFF_MERGE', 'SIMULATION')),
  deactivated_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (file_system_id) REFERENCES arc_db_files(system_id) ON DELETE CASCADE
);

CREATE INDEX idx_session_modes_file ON session_modes(file_system_id);
CREATE INDEX idx_session_modes_active ON session_modes(file_system_id, deactivated_at);
```

**Purpose**: Tracks the current mode of a project. Only one active mode per project (WHERE deactivated_at IS NULL). The `created_at` timestamp serves as the activation time.

#### edit_sessions
```sql
CREATE TABLE edit_sessions (
  session_id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(255),
  client_id VARCHAR(255) NOT NULL,
  file_system_id INTEGER NOT NULL,
  mode_id VARCHAR(36) NOT NULL,
  edit_status VARCHAR(20) NOT NULL CHECK (edit_status IN ('ACTIVE', 'COMMITTED')),
  committed_at TIMESTAMP,
  commit_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (file_system_id) REFERENCES arc_db_files(system_id) ON DELETE CASCADE,
  FOREIGN KEY (mode_id) REFERENCES session_modes(mode_id) ON DELETE CASCADE
);

CREATE INDEX idx_edit_sessions_file ON edit_sessions(file_system_id);
CREATE INDEX idx_edit_sessions_status ON edit_sessions(edit_status);
CREATE INDEX idx_edit_sessions_mode ON edit_sessions(mode_id);
```

**Purpose**: Tracks individual edit sessions within a mode. Multiple sessions can exist per mode over time, but only one active session per user per project.

#### edit_actions
```sql
CREATE TABLE edit_actions (
  change_id VARCHAR(36) PRIMARY KEY,
  system_id VARCHAR(36) NOT NULL,  -- GUID for pending entities; mapped to integer at commit
  session_id VARCHAR(36) NOT NULL,
  table_name VARCHAR(100) NOT NULL,
  operation VARCHAR(10) NOT NULL CHECK (operation IN ('ADD', 'UPDATE', 'DELETE')),
  payload TEXT NOT NULL,  -- JSON
  change_status VARCHAR(20) NOT NULL DEFAULT 'STAGED' 
    CHECK (change_status IN ('UNSTAGED', 'STAGED', 'DISCARDED')),
  base_version INTEGER,  -- NULL for Add operations
  group_id VARCHAR(36),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  valid_until TIMESTAMP,  -- NULL means current version
  FOREIGN KEY (session_id) REFERENCES edit_sessions(session_id) ON DELETE CASCADE
);

CREATE INDEX idx_edit_actions_session ON edit_actions(session_id);
CREATE INDEX idx_edit_actions_system_id ON edit_actions(system_id, table_name);
CREATE INDEX idx_edit_actions_valid ON edit_actions(valid_until);
CREATE INDEX idx_edit_actions_status ON edit_actions(session_id, change_status);
CREATE UNIQUE INDEX uniq_edit_actions_current 
  ON edit_actions(session_id, system_id, table_name) 
  WHERE valid_until IS NULL;
```

**Purpose**: Stores individual edit operations as events. Each change is immutable; updates create new versions with `valid_until` set on old versions.

#### restore_points
```sql
CREATE TABLE restore_points (
  restore_id VARCHAR(36) PRIMARY KEY,
  session_id VARCHAR(36),  -- NULL for non-edit mode restores
  file_system_id INTEGER NOT NULL,
  restore_type VARCHAR(20) NOT NULL CHECK (restore_type IN ('EDIT_SNAPSHOT', 'FULL_SNAPSHOT')),
  snapshot_data TEXT NOT NULL,  -- JSON
  description TEXT,
  system_id INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  version INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (session_id) REFERENCES edit_sessions(session_id) ON DELETE CASCADE,
  FOREIGN KEY (file_system_id) REFERENCES arc_db_files(system_id) ON DELETE CASCADE
);

CREATE INDEX idx_restore_points_session ON restore_points(session_id);
CREATE INDEX idx_restore_points_file ON restore_points(file_system_id);
```

**Purpose**: Stores snapshots for undo/redo functionality. Can be session-specific (EDIT_SNAPSHOT) or full project snapshots (FULL_SNAPSHOT).

### Normalization & Relationships

**Normalization Level**: 3NF (Third Normal Form)

**Key Relationships**:
1. **edit_sessions → arc_db_files**: Many-to-one (multiple sessions per project file)
2. **edit_actions → edit_sessions**: Many-to-one (multiple actions per session)
3. **restore_points → edit_sessions**: Many-to-one (multiple restore points per session; nullable for non-edit restores)
4. **restore_points → arc_db_files**: Many-to-one (all restore points belong to a project file)
5. **edit_actions → actual tables**: Logical relationship via `system_id` + `table_name` (no FK constraint)

**Design Rationale**:
- **GUID system_id in edit_actions**: Eliminates concurrency issues; multiple users can safely generate IDs without conflicts or reservation
- **No FK from edit_actions to actual tables**: Allows Add operations with GUIDs before actual insert; mapping happens at commit time
- **valid_until for versioning**: Supports undo/redo by invalidating old versions without deletion
- **JSON payload**: Flexible schema for different table structures; validated at application layer
- **Nullable session_uuid in restore_points**: Allows restore points for both edit sessions (EditSnapshot) and committed state (FullSnapshot)

**SystemId Strategy**:
- **During Edit Mode**: Use GUID (UUID v4) for all new entities in edit_actions
- **Cross-References**: Pending entities reference each other via GUIDs (e.g., DataLink references Module GUID)
- **At Commit Time**: 
  1. Insert entities into actual tables → DB auto-generates integer system_id
  2. Build GUID→Integer mapping: `Map<string, number>`
  3. Update dependent entities using the mapping before insertion
- **Benefits**: No ID reservation, no concurrency issues, clean separation between pending and committed state

### Indexing Strategy

**Primary Indexes**:
1. `idx_edit_sessions_file`: Fast lookup of sessions by project
2. `idx_edit_actions_session`: Fast retrieval of all actions in a session
3. `idx_edit_actions_system_id`: Fast lookup of changes for specific entity
4. `idx_edit_actions_valid`: Fast filtering of current (non-invalidated) actions
5. `uniq_edit_actions_current`: Enforce one current version per entity per session

**Query Optimization**:
- **Read Overlay**: Use `idx_edit_actions_session` + `idx_edit_actions_valid` for O(n) scan of pending changes
- **Conflict Detection**: Use `idx_edit_actions_system_id` to find base versions quickly
- **Cascade Deletes**: When deleting module, use `idx_edit_actions_system_id` to find dependent links

---

## 4) Session Management

### Implicit Session Lifecycle

**Key Principle**: Clients do not create, store, or manage session IDs. Backend automatically handles session lifecycle using `userId` (from JWT) + `projectId` as the session identifier.

#### Session Creation (Automatic)

**Any Edit Operation Triggers Session Creation**:
```
POST /arcapi/v1/projects/:projectId/modules-instance
POST /arcapi/v1/projects/:projectId/data-links
PATCH /arcapi/v1/projects/:projectId/modules-instance/:systemId
DELETE /arcapi/v1/projects/:projectId/modules-instance/:systemId
... (any edit operation)
```

**Backend Logic**:
```typescript
async getOrCreateSession(userId: string, projectId: number): Promise<EditSession> {
  // Check for existing active session
  let session = await this.sessionRepo.findActiveSession(userId, projectId);
  
  if (!session) {
    // Auto-create new session
    session = await this.sessionRepo.create({
      userId,
      projectId,
      editType: 'Designer', // or inferred from client-id
      status: 'Active'
    });
  }
  
  return session;
}
```

**Request Headers**: 
- `Authorization: Bearer <JWT>` (contains userId)
- `X-Client-Id`: Optional client application identifier (e.g., "GraphDesigner", "ModuleTuner")

**Response Headers**:
- `X-Session-Id`: Session UUID (informational only; clients don't need to store this)

#### Multi-Client Synchronization

**Scenario**: Same user operates multiple client applications (e.g., Graph Designer + Module Tuner) simultaneously

**Behavior**:
- Both clients share the same edit session (identified by userId + projectId)
- Changes made in one client are immediately visible in the other via read overlay
- Both clients see the same pending changes
- Commit from either client commits all pending changes from both

**Example Flow**:
1. User opens Graph Designer → adds module → session auto-created
2. User opens Module Tuner (same project) → updates module properties → reuses same session
3. User returns to Graph Designer → sees both changes (module + properties)
4. User commits from Graph Designer → both changes committed atomically

#### Session Status Transitions

```
[No Session] 
    │
    │ First edit operation
    ▼
[Active]
    │
    ├─→ Commit → [Committed]
    │
    └─→ Rollback → [Rejected]
```

---

## 5) Payload Strategy Using Partial<T>

### Overview

The modification framework uses TypeScript's `Partial<T>` utility type to create minimal, type-safe payloads that store only changed fields in the `edit_actions` table.

### Two API Patterns

#### Pattern A: Full Entity Update (ModuleDefinition only)
- Client sends complete entity
- Backend compares old vs new state
- Generates granular diffs using `Partial<T>`

#### Pattern B: Individual Commands (Everything else)
- Client sends specific command
- Backend directly creates `Partial<T>` payload
- No comparison needed

### Benefits

1. **Type Safety**: Reuses existing domain models, TypeScript catches errors at compile time
2. **Minimal Payloads**: Only stores changed fields (99% size reduction)
3. **Simple Overlay**: Spread operator merges changes: `{ ...base, ...payload }`
4. **Consistent Format**: Same storage structure regardless of API pattern

### Example: Update Module Alias

```typescript
// Domain model
interface SpfModule {
  systemId: number;
  instanceId: number;
  alias: string;
  definitionSystemId: number;
  subgraphSystemId: number;
  containerSystemId: number;
  properties: SpfModuleProperty[];
  version: number;
}

// Update payload - only changed field
const payload: Partial<SpfModule> = {
  alias: "NewAlias"
};

// Stored in edit_actions.payload
// Result: { "alias": "NewAlias" }  (50 bytes vs 10KB+ for full entity)
```

### Payload Strategy by Operation Type

**Update Operations**:
```typescript
// Only changed fields
const payload: Partial<SpfModule> = {
  alias: "NewAlias"
};
// Stored: { "alias": "NewAlias" }
```

**Add Operations**:
```typescript
// Full entity
const payload: SpfModule = {
  systemId: uuidv4(),
  instanceId: 123,
  alias: "NewModule",
  definitionSystemId: 456,
  subgraphSystemId: 789,
  containerSystemId: 101,
  properties: [],
  version: 1
};
// Stored: { "systemId": "guid-123", "instanceId": 123, ... }
```

**Delete Operations**:
```typescript
// Empty payload
const payload = {};
// Stored: {}
```

### Read Overlay Implementation

```typescript
@Injectable()
export class ReadOverlayService {
  async getModuleWithOverlay(
    systemId: number,
    sessionId: string
  ): Promise<SpfModule> {
    // 1. Get base module from actual table
    const baseModule = await this.moduleRepo.findOne(systemId);

    // 2. Get pending changes for this module
    const pendingChanges = await this.getPendingChanges(
      sessionId,
      'spf_modules',
      systemId
    );

    // 3. Apply overlay using spread operator
    let overlayedModule = { ...baseModule };

    for (const change of pendingChanges) {
      if (change.operation === 'Update') {
        const payload = JSON.parse(change.payload);
        overlayedModule = { ...overlayedModule, ...payload };  // Merge!
      }
    }

    return overlayedModule;
  }
}
```

---

## 6) Repository Architecture

### Aggregate-Specific Edit Repositories

Each aggregate has its own edit repository that encapsulates domain knowledge:

```typescript
// packages/infrastructure/persistence/src/edit-repositories/module-edit.repository.ts

@Injectable()
export class ModuleEditRepository {
  constructor(
    private readonly editActionsService: EditActionsService  // Receives from UoW
  ) {}

  /**
   * Save module alias update
   * Domain-specific: Knows about SpfModule structure
   */
  async saveAliasUpdate(
    module: SpfModule,
    newAlias: string,
    sessionId: string
  ): Promise<string> {
    const groupId = uuidv4();
    const changeId = uuidv4();

    // Create payload using domain knowledge
    const payload: Partial<SpfModule> = {
      alias: newAlias
    };

    // Get base version
    const baseVersion = await this.editActionsService.getCurrentVersion(
      'spf_modules',
      module.systemId.toString()
    );

    // Create edit action row
    const row: EditActionRow = {
      changeUuid: changeId,
      systemId: module.systemId.toString(),
      sessionUuid: sessionId,
      tableName: 'spf_modules',
      operation: 'Update',
      payload: JSON.stringify(
        this.editActionsService.removeNullFields(payload)
      ),
      commitStatus: 'Staged',
      baseVersion,
      groupId,
      createdAt: new Date(),
      validUntil: null
    };

    // Delegate to common service
    return await this.editActionsService.insertEditAction(row);
  }

  /**
   * Save module property update
   * Domain-specific: Knows about nested SpfModuleProperty structure
   */
  async savePropertyUpdate(
    property: SpfModuleProperty,
    updates: Partial<SpfModuleProperty>,
    sessionId: string
  ): Promise<string> {
    // Similar implementation...
  }

  /**
   * Delete module with cascade logic
   * Domain-specific: Handles cascade logic
   */
  async saveModuleDelete(
    module: SpfModule,
    sessionId: string
  ): Promise<string[]> {
    const groupId = uuidv4();
    const changeIds: string[] = [];

    // 1. Delete module properties first (cascade)
    for (const property of module.properties) {
      const changeId = await this.deleteProperty(property, sessionId, groupId);
      changeIds.push(changeId);
    }

    // 2. Delete module itself
    const moduleChangeId = await this.deleteModule(module, sessionId, groupId);
    changeIds.push(moduleChangeId);

    return changeIds;
  }
}
```

### Common EditActionsService

```typescript
// packages/infrastructure/persistence/src/edit-actions/edit-actions.service.ts

export class EditActionsService {
  constructor(private readonly queryRunner: QueryRunner) {}

  /**
   * Insert a single edit action row
   * Uses shared QueryRunner from UoW
   */
  async insertEditAction(row: EditActionRow): Promise<string> {
    await this.queryRunner.manager.insert('edit_actions', {
      change_uuid: row.changeUuid,
      system_id: row.systemId,
      session_uuid: row.sessionUuid,
      table_name: row.tableName,
      operation: row.operation,
      payload: row.payload,
      commit_status: row.commitStatus,
      base_version: row.baseVersion,
      group_id: row.groupId,
      created_at: row.createdAt,
      valid_until: row.validUntil
    });

    return row.changeUuid;
  }

  /**
   * Get current version for conflict detection
   */
  async getCurrentVersion(tableName: string, systemId: string): Promise<number> {
    const result = await this.queryRunner.manager
      .createQueryBuilder()
      .select('version')
      .from(tableName, 't')
      .where('t.system_id = :systemId', { systemId })
      .getRawOne();

    return result?.version || 0;
  }

  /**
   * Utility: Remove null/undefined fields
   */
  removeNullFields(obj: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== null && value !== undefined) {
        result[key] = value;
      }
    }
    return result;
  }
}
```

### Unit of Work Integration

```typescript
// packages/api/src/infrastructure-wrapper/persistence/unit-of-work/typeorm-unit-of-work.ts

export interface IUnitOfWork {
  // Existing repositories
  moduleRepository: IModuleRepository;
  subgraphRepository: ISubgraphRepository;
  
  // NEW: Edit repositories
  moduleEditRepository: ModuleEditRepository;
  subgraphEditRepository: SubgraphEditRepository;
  moduleDefinitionEditRepository: ModuleDefinitionEditRepository;
  
  // NEW: Shared edit actions service
  editActionsService: EditActionsService;
  
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

@Injectable()
export class TypeOrmUnitOfWork implements IUnitOfWork {
  private queryRunner: QueryRunner;
  private _editActionsService?: EditActionsService;
  private _moduleEditRepository?: ModuleEditRepository;

  // EditActionsService getter (created once, shared by all edit repos)
  get editActionsService(): EditActionsService {
    if (!this._editActionsService) {
      this._editActionsService = new EditActionsService(this.queryRunner);
    }
    return this._editActionsService;
  }

  // ModuleEditRepository getter
  get moduleEditRepository(): ModuleEditRepository {
    if (!this._moduleEditRepository) {
      this._moduleEditRepository = new ModuleEditRepository(
        this.editActionsService  // Pass shared service
      );
    }
    return this._moduleEditRepository;
  }

  // ... other repository getters
}
```

---

## 7) Workflow / Processes

### End-to-End Request Lifecycle

#### Add Module Flow

```
Client
  │
  │ POST /projects/123/modules-instance
  │ { definitionSystemId: 456, ... }
  ▼
ModuleInstanceController
  │ • Validate DTO
  │ • Extract user context from JWT
  │ • Check/create edit session
  ▼
CommandBus
  │ • Route to AddModuleCommandHandler
  │ • Apply transaction middleware
  ▼
AddModuleCommandHandler
  │ 1. Get or create active session
  │ 2. Generate GUID for systemId
  │ 3. Validate module definition exists
  │ 4. Create full entity payload
  │ 5. Call moduleEditRepo.saveModuleAdd()
  ▼
ModuleEditRepository
  │ • Create EditActionRow with full entity
  │ • Call editActionsService.insertEditAction()
  ▼
EditActionsService
  │ • Insert into edit_actions table
  │ • Uses shared QueryRunner from UoW
  ▼
TypeORM Unit of Work
  │ • COMMIT transaction
  ▼
Controller maps to ModuleInstanceDto
  │ • systemId: guid-1234
  │ • diffType: 'Added'
  │ • changeId: 'uuid'
  ▼
HTTP 201 Created
  ▼
Client
```

#### Smart Commit Flow

**Scenario: Graph Changes with Generated Usecases**

```
Client
  │ POST /projects/123/edit-session/commit
  ▼
CommitSessionCommandHandler
  │ 1. Detect graph changes: YES
  │ 2. Run usecase generation algorithm
  │ 3. New usecases found: 2
  │ 4. Add as UNSTAGED to edit_actions
  ▼
HTTP 200 OK (status: REQUIRES_REVIEW)
  │ {
  │   "status": "REQUIRES_REVIEW",
  │   "unstagedChanges": [...]
  │ }
  ▼
Client
  │ User reviews unstaged usecases in UI
  │ Stages desired ones, rejects unwanted ones
  │
  │ POST /projects/123/edit-session/stage
  │ { changeIds: ["uuid1"] }
  ▼
StageChangesCommand
  │ Mark usecase as 'Staged'
  ▼
Client
  │ POST /projects/123/edit-session/commit (again)
  ▼
CommitSessionCommandHandler
  │ 1. Validate no unstaged changes ✓
  │ 2. Conflict detection ✓
  │ 3. Apply changes (within transaction)
  ▼
CommitOrchestrator
  │ 2. Process in topology order:
  │    a. Deletes (reverse order)
  │    b. Updates (any order)
  │    c. Adds (forward order)
  │ 3. For each Add (GUID → Integer mapping):
  │    - Insert into actual table
  │    - Build mapping: guidToIntMap[guid] = generatedId
  │    - Update dependent entities
  │ 4. Update session status to 'Committed'
  │ 5. Delete edit_actions
  ▼
TypeORM Unit of Work
  │ • COMMIT transaction
  ▼
HTTP 200 OK
  │ { "status": "COMMITTED", "committedChanges": 18 }
  ▼
Client
```

### Validation & Transaction Boundaries

#### Validation Layers

1. **DTO Validation** (Controller layer):
   - Type checking, required fields, format validation
   - Uses `class-validator` decorators
   - Fails fast with 400 Bad Request

2. **Domain Validation** (Command handler):
   - Business rules (e.g., module definition exists)
   - Referential integrity (e.g., subgraph exists)
   - Fails with 422 Unprocessable Entity

3. **Conflict Validation** (Commit handler):
   - Version checking for optimistic locking
   - Unstaged changes check
   - Fails with 409 Conflict or 422

#### Transaction Boundaries

**Per-Operation Transactions**:
```typescript
@Transactional()  // Middleware applied by command bus
async handle(command: AddModuleCommand): Promise<AddModuleResult> {
  // All database operations within this handler are in one transaction
  const session = await uow.sessionRepo.getOrCreate(command.projectId);
  const editAction = await uow.moduleEditRepo.saveModuleAdd(module, session.id);
  // Transaction commits automatically if no exception
}
```

**Commit Transaction** (All-or-nothing):
```typescript
@Transactional()
async handle(command: CommitSessionCommand): Promise<CommitResult> {
  // 1. Validate (read-only queries)
  const conflicts = await this.detectConflicts(command.sessionId);
  if (conflicts.length > 0) {
    throw new VersionConflictException(conflicts);
  }

  // 2. Apply all changes (writes)
  await this.applyDeletes(command.sessionId);
  await this.applyUpdates(command.sessionId);
  await this.applyAdds(command.sessionId);

  // 3. Update session status
  await uow.sessionRepo.markCommitted(command.sessionId);

  // Transaction commits here
}
```

---

## 8) Status Codes & Error Model

### HTTP Status Codes

| Status Code | Scenario | Error Code |
|-------------|----------|------------|
| `200 OK` | Successful read operation | - |
| `201 Created` | Successful create operation | - |
| `400 Bad Request` | Invalid DTO validation | `VALIDATION_ERROR` |
| `401 Unauthorized` | Invalid or missing JWT | `UNAUTHORIZED` |
| `404 Not Found` | Entity not found | `ENTITY_NOT_FOUND` |
| `409 Conflict` | Version conflict at commit | `VERSION_CONFLICT` |
| `422 Unprocessable Entity` | Unstaged changes at commit | `UNSTAGED_CHANGES` |
| `422 Unprocessable Entity` | Cascade delete validation | `CASCADE_CONSTRAINT` |
| `500 Internal Server Error` | Unexpected error | `INTERNAL_ERROR` |

### Error Response Format

```typescript
{
  "success": false,
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "Human-readable message",
    "details": {
      // Context-specific details
      "conflicts": [
        {
          "systemId": 1001,
          "tableName": "spf_modules",
          "baseVersion": 5,
          "currentVersion": 7,
          "conflictingUser": "user2"
        }
      ]
    },
    "timestamp": "2025-12-15T10:00:00Z",
    "path": "/arcapi/v1/projects/123/edit-session/commit"
  }
}
```

### Commit Response States

**Success - Committed**:
```typescript
{
  "status": "COMMITTED",
  "success": true,
  "committedChanges": 15,
  "generatedUsecases": [
    { "systemId": 5001, "name": "Auto-generated: Playback Path 1" }
  ],
  "message": "Changes committed successfully"
}
```

**Requires Review - Unstaged Changes Exist**:
```typescript
{
  "status": "REQUIRES_REVIEW",
  "requiresStaging": true,
  "stagedChanges": 15,
  "unstagedChanges": [
    {
      "changeId": "uuid1",
      "tableName": "use_cases",
      "operation": "Add",
      "commitStatus": "Unstaged",
      "generatedBy": "UsecaseGenerationAlgorithm",
      "preview": {
        "name": "Auto-generated: Playback Path 1"
      }
    }
  ],
  "message": "Review 2 unstaged changes before committing"
}
```

---

## 9) Observability

### Metrics (OpenTelemetry Style)

**Key Metrics to Track**:

1. **Session Metrics**:
   - `edit.sessions.active` (gauge): Active sessions count
   - `edit.sessions.duration` (histogram): Session duration in seconds
   - `edit.sessions.created` (counter): Sessions created per hour
   - `edit.sessions.committed` (counter): Sessions committed per hour
   - `edit.sessions.rejected` (counter): Sessions rejected per hour

2. **Edit Operation Metrics**:
   - `edit.operations.total` (counter): Operations by type (Add/Update/Delete)
     - Labels: `operation`, `table_name`, `status`
   - `edit.operations.duration` (histogram): Operation latency in milliseconds
     - Labels: `operation`, `table_name`
   - `edit.operations.failed` (counter): Failed operations by error type
     - Labels: `error_type`

3. **Commit Metrics**:
   - `edit.commits.success_rate` (gauge): Commit success rate (0-1)
   - `edit.commits.duration` (histogram): Commit duration in seconds
   - `edit.commits.conflicts` (counter): Version conflicts per hour
   - `edit.commits.unstaged_rejections` (counter): Unstaged changes rejections

4. **Read Overlay Metrics**:
   - `edit.overlay.cache_hit_rate` (gauge): Overlay cache hit rate (0-1)
   - `edit.overlay.query_duration` (histogram): Overlay query duration in milliseconds
   - `edit.overlay.entities_pending` (gauge): Entities with pending changes

5. **Database Metrics**:
   - `db.query.duration` (histogram): Query duration by table
     - Labels: `table_name`, `operation`
   - `db.connection_pool.utilization` (gauge): Connection pool utilization (0-1)
   - `db.transaction.rollback_rate` (gauge): Transaction rollback rate (0-1)

**Implementation Example** (OpenTelemetry):
```typescript
import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('edit-session');

const activeSessionsGauge = meter.createObservableGauge('edit.sessions.active', {
  description: 'Number of active edit sessions'
});

const operationCounter = meter.createCounter('edit.operations.total', {
  description: 'Total edit operations'
});

const commitDurationHistogram = meter.createHistogram('edit.commits.duration', {
  description: 'Commit operation duration',
  unit: 'seconds'
});

// Usage
operationCounter.add(1, { 
  operation: 'Add', 
  table_name: 'spf_modules', 
  status: 'success' 
});

commitDurationHistogram.record(duration, { 
  status: success ? 'success' : 'failure' 
});
```

---

## 10) Security & Compliance

### Validation Strategy

#### DTO Validation (API Layer)
```typescript
export class CommitSessionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  commitMessage: string;

  @IsOptional()
  @IsBoolean()
  forceCommit?: boolean;  // Admin override for conflicts
}
```

#### Domain Validation (Core Layer)
```typescript
export class EditSession {
  commit(commitMessage: string): void {
    // Domain invariants
    if (this.status !== 'Active') {
      throw new DomainException('Cannot commit non-active session');
    }

    if (this.hasUnstagedChanges()) {
      throw new DomainException('Cannot commit with unstaged changes');
    }

    if (!commitMessage || commitMessage.trim().length === 0) {
      throw new DomainException('Commit message is required');
    }

    this.status = 'Committed';
    this.commitText = commitMessage;
    this.releasedAt = new Date();
  }
}
```

### Input Sanitization

- **SQL Injection**: Prevented by TypeORM parameterized queries
- **XSS**: Not applicable (JSON API, no HTML rendering)
- **Command Injection**: Not applicable (no shell commands from user input)
- **Path Traversal**: Not applicable (no file system access from user input)

### Authentication & Authorization

- **Authentication**: JWT-based (existing auth module)
- **Authorization**: Role-based access control (future enhancement)
- **Session Ownership**: Users can only access their own sessions

---

## 11) Performance & Scalability

### Bottleneck Analysis

#### 1. Database Write Patterns
**Bottleneck**: SQLite single-writer limitation
- **Current Load**: <10 writes/second per project
- **Capacity**: ~1000 writes/second (SQLite limit)
- **Mitigation**:
  - Batch edit actions where possible
  - Use WAL mode (Write-Ahead Logging) for better concurrency
  - Future: Migrate to PostgreSQL for true multi-writer support

**Enable WAL Mode**:
```typescript
export const dataSourceProvider = {
  provide: DataSource,
  useFactory: async () => {
    const dataSource = new DataSource({
      type: 'sqlite',
      database: getDatabasePath(),
      // ... other options
    });

    await dataSource.initialize();
    
    // Enable WAL mode for better concurrency
    await dataSource.query('PRAGMA journal_mode=WAL');
    await dataSource.query('PRAGMA synchronous=NORMAL');
    
    return dataSource;
  }
};
```

#### 2. Read Overlay Performance
**Bottleneck**: Scanning edit_actions table for every read
- **Current**: O(n) scan where n = pending changes in session
- **Typical n**: 10-100 (Designer), 1000+ (DiffMerge)
- **Mitigation**:
  - Cache pending changes per session
  - Index on (session_uuid, system_id, table_name)
  - Batch reads where possible

### Capacity Planning

**SQLite Limitations**:
- Max database size: 281 TB (not a concern)
- Max concurrent readers: Unlimited
- Max concurrent writers: 1
- Max row count: 2^64 (not a concern)

**When to Migrate to PostgreSQL**:
- **Trigger 1**: >20 concurrent editors per project
- **Trigger 2**: Write contention causing >1s latency
- **Trigger 3**: Need for advanced features (full-text search, JSON queries)

---

## 12) Risks & Trade-offs

### Decision Records (ADRs)

**ADR-001: Use Optimistic Locking for Concurrency Control**

**Context**: Multiple users may edit the same project simultaneously.

**Decision**: Use optimistic locking with version numbers. Detect conflicts at commit time.

**Rationale**:
- Allows concurrent editing without blocking
- Simpler than pessimistic locking
- Aligns with stateless API design
- Users explicitly commit, so conflict detection at commit time is acceptable

**Consequences**:
- Users may encounter version conflicts
- Need clear UX for conflict resolution
- Requires version column on all entity tables

**Status**: Accepted

---

**ADR-002: Aggregate-Specific Repositories + Common Service**

**Context**: Need to track pending changes with domain knowledge while avoiding code duplication.

**Decision**: Create aggregate-specific edit repositories (ModuleEditRepository, SubgraphEditRepository) that use a common EditActionsService for database operations.

**Rationale**:
- **Domain-focused**: Each aggregate has its own repository with domain knowledge
- **Clear boundaries**: Respects aggregate roots
- **Maintainable**: Changes to one aggregate don't affect others
- **Testable**: Can test each aggregate's edit logic independently
- **Reusable**: Common service handles the actual DB writes

**Consequences**:
- More repository classes (one per aggregate)
- Clear separation between domain logic and infrastructure
- EditActionsService created inside UoW with shared QueryRunner

**Status**: Accepted

---

**ADR-003: GUID-Based SystemId Strategy for Pending Entities**

**Context**: Need to assign systemIds to new entities during edit mode without database round-trips or ID reservation.

**Decision**: Use GUID (UUID v4) for `system_id` in `edit_actions` table; map to auto-generated integer IDs at commit time.

**Rationale**:
- **No Concurrency Issues**: Multiple users can generate GUIDs independently without conflicts
- **No ID Reservation**: Eliminates need for pre-allocating ID ranges or locking mechanisms
- **Clean Separation**: Pending entities (GUIDs) clearly distinguished from committed entities (integers)
- **Cross-References**: Pending entities can reference each other via GUIDs before commit

**Consequences**:
- `edit_actions.system_id` must be VARCHAR(36) instead of INTEGER
- Commit orchestrator must build and apply GUID→Integer mapping
- Dependent entities must be updated with mapped IDs

**Status**: Accepted

---

**ADR-004: Implicit Session Management**

**Context**: Need to manage edit sessions without requiring clients to create, store, or manage session IDs.

**Decision**: Backend automatically creates and manages sessions using `userId` (from JWT) + `projectId` as the session identifier.

**Rationale**:
- **Simplified Client Logic**: Clients don't need session management code
- **Stateless API**: Session state stored in database, not in-memory
- **Multi-Client Support**: Same user with multiple clients automatically share the same session
- **Automatic Lifecycle**: Session created on first edit, reused for subsequent edits

**Consequences**:
- Backend must implement `getOrCreateSession(userId, projectId)` logic
- One active session per user per project (enforced by unique constraint)
- Session ID returned in response headers for informational purposes only

**Status**: Accepted

---

## 13) Citations

### Official Documentation References

1. **NestJS**:
   - CQRS Module: https://docs.nestjs.com/recipes/cqrs
   - Guards & Middleware: https://docs.nestjs.com/guards
   - Exception Filters: https://docs.nestjs.com/exception-filters

2. **TypeORM**:
   - Transactions: https://typeorm.io/transactions
   - Entity Schemas: https://typeorm.io/entity-schema
   - Query Builder: https://typeorm.io/select-query-builder

3. **HTTP Standards**:
   - RFC 9110 (HTTP Semantics): https://www.rfc-editor.org/rfc/rfc9110.html
   - RFC 7231 (HTTP/1.1): https://www.rfc-editor.org/rfc/rfc7231.html

4. **Architecture Patterns**:
   - Twelve-Factor App: https://12factor.net/
   - Domain-Driven Design (Evans): ISBN 0-321-12521-5
   - Implementing Domain-Driven Design (Vernon): ISBN 978-0-321-83457-7

5. **Observability**:
   - OpenTelemetry: https://opentelemetry.io/docs/
   - OpenTelemetry JavaScript: https://opentelemetry.io/docs/instrumentation/js/

6. **Node.js**:
   - Worker Threads: https://nodejs.org/api/worker_threads.html
   - Performance Hooks: https://nodejs.org/api/perf_hooks.html

### Pragmatic Recommendations

The following design decisions are based on practical experience and industry best practices:

- **Optimistic Locking**: Widely used pattern for collaborative editing systems
- **Read Overlay Pattern**: Common in event-sourced systems for query optimization
- **Staged Workflow**: Inspired by Git's staging area concept
- **Aggregate-Specific Repositories**: DDD best practice for maintaining aggregate boundaries

---

## Document Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-12-15 | Architecture Team | Initial HLD for Modification Framework |
| 2.0 | 2025-12-18 | Architecture Team | Consolidated design with UoW integration, Partial<T> strategy, OpenTelemetry metrics |

---

**End of Document**
