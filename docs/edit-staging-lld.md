# Edit Mode Staging – Low-Level Design (LLD)

This LLD captures the original problem and the final agreed solution: Option C (refined) using partial JSON patches per action, lightweight per-entity index tables, optimistic concurrency, file-level locking, and self-referencing actions (parentId/groupId) for composite operations. It is intended to be implementable by backend engineers familiar with TypeORM, NestJS, and SQLite.

## 1) Original Problem

We need a DB-backed, session-aware edit workflow where a user can:
- Start an edit session on a file (ArcDbFile scope).
- Perform Adds/Updates/Deletes across modules, containers, subgraphs, nodes, ports, data/control links, and property tables (project/file metadata excluded).
- Validate the overlay state; if valid, atomically commit changes to actual tables and end edit mode.
- During edit mode, reads must return actual data overlaid with session changes (Status: Added/Updated/Deleted).
- Track each change via ordered action IDs; support “remove all actions after id” by hard delete or discard (ignore in overlay).

Constraints and architecture:
- TypeORM + SQLite, EntitySchema; `systemId` integer PK; `created_at`, `updated_at` timestamps.
- Use-case tables are file-scoped via `file_system_id` (ArcDbFile).
- UnitOfWork provides transactional execution (QueryRunner).
- CQRS in place; query services will produce overlay views.

## 2) Final Solution Overview (Option C Refined)

- Action log (edit_actions) stores:
  - Add/Update/Delete changes with minimal payloads (Add = full minimal row; Update = partial JSON patch; Delete = identifiers only).
  - Ordered sequence per session.
  - Self-referencing parentId/groupId to model composite operations and undo.
- Lightweight, per-entity index tables store typed relational metadata needed for overlay queries and validations (no JSON parsing).
- No staging table mirrors; derive overlay on reads.
- No duplication of sessionUuid/fileSystemId in index tables; obtain via joins from edit_actions → edit_sessions.
- Optimistic concurrency via `version` integer on actual tables; guarded updates/deletes at Save.

## 3) Tables and Schemas

Note: Types shown conceptually; implement via TypeORM EntitySchema with correct column names and indices. Use FK ON DELETE CASCADE where indicated; enable SQLite foreign_keys pragma.

### 3.1 edit_sessions (logical lock + session context)
- Columns:
  - systemId: integer PK
  - sessionUuid: string(36) unique
  - userId: string or integer (according to auth model)
  - fileSystemId: integer FK → files.system_id (ArcDbFile)
  - status: enum ['active', 'closed', 'discarded']
  - created_at, updated_at: timestamps
- Relations:
  - file: many-to-one ArcDbFile (onDelete: CASCADE)
- Indices:
  - unique(sessionUuid)
  - index(userId, fileSystemId, status)

### 3.2 edit_actions (self-referencing action log)
- Columns:
  - systemId: integer PK (this equals the affected entity’s systemId; pre-generated for Adds)
  - sessionUuid: string(36) (FK-like reference to edit_sessions)
  - sequence: integer (monotonic per session; unique within a session)
  - entityType: enum ['module', 'container', 'subgraph', 'node', 'data_link', 'module_property', 'module_property_values', ...]
  - operation: enum ['Add', 'Update', 'Delete']
  - payload: JSON (Add = full minimal row; Update = partial patch; Delete = optional metadata only)
  - discarded: boolean (default false)
  - baseVersion: integer nullable (captured on first Update/Delete per entity during session)
  - parentId: integer nullable (FK → edit_actions.systemId, self-ref root/owner of composite)
  - groupId: string nullable (groups siblings produced by same sub-step)
  - created_at, updated_at: timestamps
- Indices:
  - (sessionUuid, sequence) unique
  - (sessionUuid, parentId)
  - (sessionUuid, groupId)
  - (entityType, systemId)
- Notes:
  - self-ref FK on parentId should use ON DELETE SET NULL (to prevent cascading unexpected deletes of parents).
  - systemId here is the domain entity’s id; for Delete/Update operations it matches the target actual row id; for Add it is pre-generated and later inserted.

### 3.3 Actual tables: add version column
- Add `version` integer to actual tables (modules, containers, data_links, properties, etc.).
- Initialize version on insert (e.g., 1).
- On each committed update/delete, guard with `WHERE system_id = :id AND version = :baseVersion` and set `version = version + 1`.

### 3.4 Per-entity index tables (normalized; no sessionUuid/fileSystemId duplication)

#### 3.4.1 edit_module_index
- Purpose: index hot-path FKs for module actions (for fast overlay filters and validations).
- Columns:
  - changeId: integer PK/FK → edit_actions.systemId (ON DELETE CASCADE)
  - systemId: integer (module id)
  - containerSystemId: integer
  - subgraphSystemId: integer
  - definitionSystemId: integer
- Indices:
  - (systemId)
  - (containerSystemId)
  - (subgraphSystemId)
  - (definitionSystemId)

#### 3.4.2 edit_data_link_index
- Purpose: index composite uniqueness tuple for data links; avoid JSON parsing.
- Columns:
  - changeId: integer PK/FK → edit_actions.systemId (ON DELETE CASCADE)
  - systemId: integer (data link id)
  - sourceNodeSystemId: integer
  - destinationNodeSystemId: integer
  - sourcePortSystemId: integer
  - destinationPortSystemId: integer
  - isInterGraph: boolean
- Indices:
  - (sourceNodeSystemId, sourcePortSystemId, destinationNodeSystemId, destinationPortSystemId)
  - (systemId)

#### 3.4.3 edit_module_property_index
- Purpose: index module property rows (CKV/TKV/calibration/tag) by owner and key.
- Columns:
  - changeId: integer PK/FK → edit_actions.systemId (ON DELETE CASCADE)
  - systemId: integer (property row id)
  - moduleSystemId: integer
  - keySystemId: integer
  - propertyKind: enum ['CKV', 'TKV', 'CALIBRATION', 'TAG', ...]
- Indices:
  - (moduleSystemId)
  - (keySystemId)
  - (propertyKind)

#### 3.4.4 edit_module_property_value_index
- Purpose: index value usage to avoid scanning arrays in JSON payloads; one row per referenced value.
- Columns:
  - changeId: integer PK/FK → edit_actions.systemId (ON DELETE CASCADE)
  - moduleSystemId: integer
  - keySystemId: integer
  - valueSystemId: integer
- Indices:
  - (moduleSystemId, keySystemId, valueSystemId)
  - (valueSystemId)

Notes:
- Add similar property index tables for container/subgraph properties if required for validations or overlay filtering.
- Do not add sessionUuid/fileSystemId columns; derive via joins on edit_actions → edit_sessions when needed.

## 4) Overlay Algorithm (Session-aware reads; server infers session)

Inputs:
- userId (from auth)
- fileSystemId (from request)
- Server determines active session via `SELECT * FROM edit_sessions WHERE userId = ? AND fileSystemId = ? AND status = 'active'`.

Steps:
1. Base read: load actual rows for the requested entity scope (e.g., modules by fileSystemId).
2. Session changes: join relevant index table to edit_actions by changeId, filter by:
   - a.sessionUuid = sessionUuid
   - a.discarded = false
   - a.operation IN ('Add','Update','Delete')
3. Compose updates per entity:
   - For each affected systemId, collect Update actions ordered by sequence; compose patches (last field value wins).
4. Merge:
   - Exclude base rows whose systemId has a Delete action.
   - For base rows with Update patches, merge composed patch over base (Status=Updated).
   - Append Add payloads as new items (Status=Added).
5. Return overlay DTOs including Status and any computed fields.

## 5) Validation Algorithm (pre-commit)

Validate overlay (actual − deletes + adds/updates) for:
- FK integrity:
  - Using index tables, ensure all FKs reference actual rows in the same file OR refer to Added rows in this session (check edit_actions with operation=Add).
- Composite uniqueness:
  - For data links, assemble tuples from actual + session index rows; detect duplicates before commit.
- File boundary:
  - Ensure all changes belong to the session’s fileSystemId (via join edit_actions → edit_sessions).
- Domain invariants:
  - Apply domain rules (e.g., port/intent) on the merged overlay.

If any check fails, return error details; user fixes and retries Save.

## 6) Save/Commit (transactional)

Within UnitOfWork.executeInTransaction:
1. Load non-discarded actions for session ordered by sequence.
2. Consolidate multiple updates for the same entity into a single effective patch (compose fields).
3. Apply per-entity:
   - Add:
     - Insert actual row using Add payload and pre-generated systemId; set version = 1.
   - Update:
     - Guarded partial update:
       - `UPDATE <entity> SET <effectivePatch>, version = version + 1 WHERE system_id = :id AND version = :baseVersion`
   - Delete:
     - Guarded delete:
       - `DELETE FROM <entity> WHERE system_id = :id AND version = :baseVersion`
4. If any guarded statement affects 0 rows → concurrency conflict; report per-entity conflict.
5. On success:
   - Mark session closed.
   - Keep action log/index rows for audit, or prune per retention policy (FK cascade keeps index tables consistent).

## 7) Locking and Concurrency

- Locking:
  - One active session per (userId, fileSystemId).
  - Other users can read actual data and see a lock indicator; cannot start a write session on the same file.
- Concurrency:
  - Add version integer to actual tables; record baseVersion when the first Update/Delete for an entity is created in the session.
  - Guard all updates/deletes with baseVersion.
  - If conflict occurs at Save, rebase: load actual, re-apply patches, re-validate, retry Save with updated baseVersion.

## 8) Undo / Restore Points

- During session:
  - Checkpoints: table edit_checkpoints { sessionUuid, sequence, label, timestamp }.
  - Revert to checkpoint by discarding or hard-deleting all actions with sequence > checkpoint.sequence; index rows cascade.
- After commit:
  - Commit history tables:
    - commits: { commitId, fileSystemId, sessionUuid, userId, tag?, createdAt }
    - commit_changes: { id, commitId, entityType, systemId, op, baseVersion, newVersion, beforePatchJson, afterPatchJson }
  - Revert to commit/tag by applying inverse operations with version guards.

## 9) Detailed Example: Module Flow (Index + parentId/groupId)

Scenario:
- File: fileSystemId = 42
- User starts session; adds a module, adds CKV + values, updates alias, deletes one value.

### 9.1 edit_actions rows (simplified view)

- Sequence 10: Add Module
  - systemId = MODULE_101
  - entityType = 'module', operation = 'Add'
  - payload = { alias: 'modA', containerSystemId: 5, subgraphSystemId: 9, definitionSystemId: 2 }
  - parentId = null
  - groupId = 'G_MOD_1'

- Sequence 11: Add CKV property row
  - systemId = MODPROP_201
  - entityType = 'module_property', operation = 'Add'
  - payload = { keySystemId: KEY_7 }
  - parentId = MODULE_101  (points to the root module change)
  - groupId = 'G_MOD_1'

- Sequence 12: Add property values (array entity or equivalent model)
  - systemId = MODPROPVAL_301
  - entityType = 'module_property_values', operation = 'Add'
  - payload = { keySystemId: KEY_7, values: [VAL_501, VAL_502] }
  - parentId = MODPROP_201
  - groupId = 'G_MOD_1'

- Sequence 20: Update Module alias (partial patch)
  - systemId = MODULE_101
  - entityType = 'module', operation = 'Update'
  - payload = { alias: 'modA-renamed' }
  - baseVersion = 3 (example)
  - parentId = MODULE_101
  - groupId = 'G_MOD_1'

- Sequence 30: Update property values (remove VAL_502)
  - systemId = MODPROPVAL_301
  - entityType = 'module_property_values', operation = 'Update'
  - payload = { values: [VAL_501] }
  - parentId = MODPROP_201
  - groupId = 'G_MOD_1'

### 9.2 Index rows (normalized; changeId = edit_actions.systemId)

- edit_module_index
  - Row A (for Add Module; changeId = MODULE_101):
    - systemId = MODULE_101
    - containerSystemId = 5
    - subgraphSystemId = 9
    - definitionSystemId = 2
  - Row B (for alias Update; changeId = MODULE_101):
    - If only alias changes, no FK updates; you may skip adding a duplicate index row.

- edit_module_property_index
  - Row C (for Add property; changeId = MODPROP_201):
    - systemId = MODPROP_201
    - moduleSystemId = MODULE_101
    - keySystemId = KEY_7
    - propertyKind = 'CKV'

- edit_module_property_value_index (one row per value)
  - Row D (for values add; changeId = MODPROPVAL_301):
    - moduleSystemId = MODULE_101
    - keySystemId = KEY_7
    - valueSystemId = VAL_501
  - Row E (for values add; changeId = MODPROPVAL_301):
    - moduleSystemId = MODULE_101
    - keySystemId = KEY_7
    - valueSystemId = VAL_502
  - When removing VAL_502 in sequence 30:
    - Delete Row E (cascade on discard of the action or explicit index maintenance), retain Row D.

### 9.3 How parentId and groupId help

- Undo entire composite operation:
  - Find all actions with parentId = MODULE_101 OR groupId = 'G_MOD_1'; discard/hard-delete them.
  - Index rows cascade via FK to edit_actions.

- Undo just a sibling sub-step (e.g., property values update):
  - Filter actions by groupId specific to that sub-step (e.g., the values group); discard those actions only.

- Visualization:
  - Render tree:
    - MODULE_101 (root)
      - MODPROP_201 (CKV)
        - MODPROPVAL_301 ([501, 502] → [501])
      - MODULE_101 alias patch

### 9.4 Overlay query (session inferred server-side; example pattern)

- Modules overlay for a user and file:
  - Actual:
    - SELECT * FROM spf_modules WHERE file_system_id = :file
  - Session changes:
    - SELECT idx.*, a.payload, a.operation, a.sequence
      FROM edit_module_index idx
      JOIN edit_actions a ON a.systemId = idx.changeId
      JOIN edit_sessions s ON s.sessionUuid = a.sessionUuid
      WHERE a.discarded = 0
        AND a.operation IN ('Add','Update','Delete')
        AND s.userId = :user
        AND s.fileSystemId = :file
  - Merge in memory:
    - Exclude actual modules with Delete actions.
    - For Update actions, compose patches per systemId by sequence and merge over actual.
    - Append Add payloads as new modules with Status=Added.

### 9.5 Validation examples (no JSON parsing)

- Value usage check (prevent removing VAL_501 if referenced in-session):
  - SELECT 1
    FROM edit_module_property_value_index v
    JOIN edit_actions a ON a.systemId = v.changeId
    JOIN edit_sessions s ON s.sessionUuid = a.sessionUuid
    WHERE a.discarded = 0
      AND s.userId = :user
      AND s.fileSystemId = :file
      AND v.valueSystemId = :val
    LIMIT 1;

- Data link uniqueness in overlay:
  - Load tuples from actual data_links for file.
  - Load tuples from edit_data_link_index joined to edit_actions/edit_sessions for session.
  - Merge and detect duplicates before commit.

## 10) API & Repository Responsibilities (Illustrative)

- Commands:
  - StartEditSession(fileSystemId) → { sessionUuid }
  - AddX(dto) → infer session by (userId, fileSystemId), write action + index rows, return change_id(s), groupId
  - UpdateX(systemId, patch) → write partial patch action; capture baseVersion on first update; update index rows when FK relations change
  - DeleteX(systemId) → write delete action
  - RemoveActionsAfterId(sequence, mode=hard|discard)
  - CreateCheckpoint(label?)
  - SaveChanges() → validate overlay; guarded commit; close session
  - TagCommit(fileSystemId, tag), RevertToCommit(tag|commitId) (post-commit)

- Queries:
  - Overlay lists per entity (server infers session by user+file).
  - Lock status per file.
  - Version inspection per entity (optional).

## 11) Implementation Notes

- Partial updates: Always use repository.update or QueryBuilder.update.set(partial) to avoid overwriting untouched columns.
- Indices:
  - edit_actions: (sessionUuid, sequence), (sessionUuid, parentId), (sessionUuid, groupId), (entityType, systemId)
  - Per-entity index tables: indices on hot-path FK columns; changeId as PK/FK → edit_actions.systemId
- Cleanup:
  - ON DELETE CASCADE on index tables ensures discarded/hard-deleted actions remove their index rows automatically.
- Retention:
  - Define audit/pruning policy for action and index rows; commit history kept per compliance needs.

## 12) Rationale

- Normalized actual schema + selective, normalized index tables → robust integrity with performant overlay/validation.
- Partial JSON patches avoid overwrite risk and reduce storage.
- Pre-generated systemIds for Adds keep references stable; no id remapping at commit.
- Derive session/file context via joins; avoid redundant columns in index tables.
- Self-referencing parentId/groupId on actions gives a simple, powerful mechanism for composite operations and undo.

## 13) Payload vs Index FKs and Sparse Index Policy

- Responsibilities:
  - Payload (edit_actions.payload):
    • Add: includes required FK fields needed to insert the actual row.
    • Update: includes only changed fields; if an FK changed (e.g., containerSystemId), include that field in the patch.
    • Delete: identifiers only; no FK fields necessary.
  - Index tables (per-entity):
    • Hold typed hot-path FK fields needed for overlay filters and validations without parsing JSON.

- Sparse index policy (delta-only):
  - Add:
    • Write complete FK set for the entity into the index table(s).
  - Update:
    • Write index rows only if an FK changed; include just the changed FK(s) in that delta row.
    • If metadata-only changes (e.g., alias), do not write index rows; rely on baseline actual FK values.
  - Delete:
    • No index writes; overlay excludes the entity due to the Delete action.

- Overlay builder (with sparse indices):
  - Start from baseline actual FK values.
  - Apply latest FK delta(s) per entity by action sequence (last value wins).
  - Result: effective FK state in overlay without JSON parsing.

## 14) Keying and Joins (to avoid duplication)

- changeId vs systemId:
  - edit_actions.systemId = changeId (primary key of the action row).
  - Index tables:
    • changeId: FK → edit_actions.systemId (which action wrote the delta).
    • systemId: entity’s id (e.g., module id).
- Session/file derivation (no duplication in index tables):
  - Join index → edit_actions (by changeId) → edit_sessions (by sessionUuid) to derive session/file context as needed.

## 15) Worked Delta Example (FK change)

- Scenario: Module MODULE_101 moves container from 5 → 8 during session.
  - Update action payload: { containerSystemId: 8 }
  - Index delta row (edit_module_index):
    • changeId = (the update action’s systemId)
    • systemId = MODULE_101
    • containerSystemId = 8
    • (subgraphSystemId/definitionSystemId omitted; baseline remains unless overridden by later deltas)
  - Overlay computation:
    • Baseline from spf_modules: container=5, subgraph=9, definition=2
    • Apply latest delta: container=8; subgraph=9; definition=2
    • Effective overlay reflects container=8 without JSON parsing.

This LLD is ready for implementation in the current NestJS/TypeORM stack with SQLite. Schema names and column names can follow existing naming conventions (snake_case, explicit FK names). Ensure UnitOfWork handles transactions and foreign_keys pragma is enabled for cascading behavior.
