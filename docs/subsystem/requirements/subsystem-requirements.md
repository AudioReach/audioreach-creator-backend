# Subsystem: Requirements

**Date:** 2026-08-05
**Status:** Updated — restructured and API inputs/outputs added
**Source:** Extracted from `SubSystemManager.cs` and `SubsystemRepository.cs` (CRFIXING8_3_2024 branch);
API contracts from `packages/api/src/presentation/rest/modules/subsystem/subsystem.controller.ts`

---

## 1. Context

### 1.1 Problem statement

Subsystems are named, hierarchical groupings that let designers organize audio graph components
(subgraphs, nested subsystems) into logical layers. They expose data ports (input/output)
and control ports that cross their boundaries, and they carry filtered-graph-key sets that govern
which calibration key-values are visible inside them.

This document captures the behavioral requirements for the subsystem write/modify API in the
AudioReach Creator Backend.

### 1.2 What this builds on

- Domain entity: `packages/core/src/domain/entities/usecase-data/subsystem/subsystem.ts`
- Persistence schema + bulk inserter:
  `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/usecase-data/subsystem/`
- Controller stubs (all `NotImplementedException`):
  `packages/api/src/presentation/rest/modules/subsystem/subsystem.controller.ts`
- Existing read-path spec: `docs/superpowers/specs/subsystem-query-lld.md`
- Subsystem-link requirements (cross-boundary link resolution):
  `docs/subsystem-links/2026-05-30-subsystem-links-requirements.md`

### 1.3 Key decisions already made

- The backend uses Hexagonal + CQRS + DDD; all write operations go through `CommandBus`.
- IDs are `uint` (natural key); the `IdGenerationPort` generates sequential IDs per type
  (`UNIQUE_ID_TYPE.SUBSYSTEM`).
- Default name on creation is `SS_0x{id:X8}` (e.g. `SS_0x00000001`).
- Port ID assignment uses the **minimum available ID** — when a new port is created, it receives
  the smallest unused port ID, filling gaps left by previously removed ports before allocating
  a new higher ID.

---

## 2. Definitions

| Term | Definition |
|------|------------|
| **Subsystem** | A named hierarchical grouping of graph components with its own ports and filtered-key set |
| **Subgraph** | A processing node in the audio graph that contains SPF modules; the primary building block placed inside subsystems |
| **Data port** | An input or output data port on a subsystem boundary (carries audio stream connections) |
| **Control port** | A control port on a subsystem boundary (carries key-value parameter control links) |
| **Child** | A component (subgraph or subsystem) owned by a parent subsystem |
| **Filtered keys** | A set of key-definition system IDs that filter which key-values are visible inside the subsystem |
| **Occupied port** | A port that has at least one active connection (data or control link) |
| **System ID** | A globally unique unsigned integer identifier assigned to each entity by the backend at creation time |

---

## 3. Functional Requirements

### 3.1 Create a Subsystem

#### FR-SS-01: Create empty subsystem

A new subsystem must be created with a system-generated unique ID.
The default name is `SS_0x{id:X8}` (uppercase hex, zero-padded to 8 digits).
The created subsystem has no children, no ports, and no filtered keys.
The operation must succeed even if no name is provided explicitly.

**Endpoint:** `POST /arc-api/v1/projects/{projectId}/subsystems`

**Inputs:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | no | Subsystem name — max 255 characters. If omitted, the system generates `SS_0x{id:X8}` |
| `parentId` | number | no | System ID of an existing subsystem to nest under; omit for root-level |

**Output:** The created subsystem — a lean record with the following fields only:

| Field | Type | Description |
|-------|------|-------------|
| `systemId` | number | System-generated unique identifier assigned at creation |
| `naturalId` | number | Natural (sequential) subsystem ID (`subsystemId`) |
| `name` | string | The assigned or auto-generated name (`SS_0x{id:X8}`) |
| `parentId` | number \| undefined | System ID of the parent subsystem, if created nested |

**Validations:**
- If `name` is provided, it must be globally unique across all subsystems in the project (case-insensitive) — I1.
- If `name` is provided, it must not exceed 255 characters.
- If `parentId` is provided, the referenced subsystem must exist in this project.

---

### 3.2 Delete Subsystem

#### FR-SS-02: Delete subsystem

A subsystem can only be deleted when it has **no child components or nested subsystems**.
If the subsystem still has children, the operation must fail with an error.
Use the move-out operation (FR-SS-08) to relocate children before deleting.

**Endpoint:** `DELETE /arc-api/v1/projects/{projectId}/subsystems/{subsystemSystemId}`

**Inputs:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `subsystemSystemId` | uint | yes | System ID of the subsystem to delete |

**Output:** Snapshot of the deleted subsystem as it existed before removal.

**Validations:**
- Subsystem must exist.
- Subsystem must have no child components or nested subsystems — if children are present, the operation must fail with the error: `"Subsystem is not empty — remove all children before deleting."`

---

### 3.3 Update Subsystem Properties

#### FR-SS-03: Rename subsystem

A subsystem's name can be updated by its system ID.
To remove a name, pass an empty string — the system resets the name to the auto-generated default (`SS_0x{id:X8}`).
The new name must be **globally unique** (case-insensitive) across all subsystems within the project.
If the name is already in use by a different subsystem, the operation must fail with an error
indicating the duplicate name.

**Endpoint:** `PATCH /arc-api/v1/projects/{projectId}/subsystems/{subsystemSystemId}`

**Inputs:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `subsystemSystemId` | uint | yes | System ID of the subsystem to rename |
| `name` | string | yes | New name — max 255 characters |

**Output:** The updated subsystem.

**Validations:**
- Subsystem must exist.
- `name` must be globally unique across the project (case-insensitive) — I1.
- `name` must not exceed 255 characters.

---

#### FR-SS-04: Set filtered graph keys

The filtered-key set of a subsystem can be replaced in full by providing a new list of
key-definition system IDs.
This is a **full replacement**, not an additive update — the existing set is discarded and
replaced with exactly the provided list.
An empty list is a valid input and clears all filtered keys.

**Endpoint:** `PUT /arc-api/v1/projects/{projectId}/subsystems/{subsystemSystemId}/filtered-keys`

**Inputs:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `subsystemSystemId` | uint | yes | System ID of the subsystem |
| `keySystemIds` | string[] | yes | New set of key-definition system IDs; empty array clears all keys |

**Output:** The updated filtered keys list — an array of entries, each containing:

| Field | Type | Description |
|-------|------|-------------|
| `keySystemId` | number | System ID of the key definition |
| `keyId` | number | Natural key ID |
| `keyLabel` | string | Human-readable key label |

**Validations:**
- Subsystem must exist.
- Every entry in `keySystemIds` must reference a key-definition that exists in this project.
- `keySystemIds` may be empty (clears all filtered keys); it must not be `null` or omitted.

---

#### FR-SS-05: Set data port count

The number of input or output data ports on a subsystem can be adjusted.

**Increasing count:** New ports are created until the target count is reached.
Each new port is assigned the **minimum available port ID** — that is, the smallest ID not
currently in use. This fills gaps left by previously removed ports before allocating a new
higher ID.
Each new port starts with an empty name.

**Decreasing count:** Only **unoccupied** ports (those with no active connections) may be removed.
Ports are candidates for removal in descending port-ID order (highest ID first).
If there are not enough unoccupied ports to reach the target count, the operation must fail
with an error indicating that occupied ports cannot be removed.

**Endpoint:** `PATCH /arc-api/v1/projects/{projectId}/subsystems/{subsystemSystemId}`

**Example:**

Initial state — 5 ports, occupied ports: 1, 3, 5 — unoccupied ports: 2, 4

*Decrement by 1 (target = 4):*
- Candidates for removal (unoccupied, highest ID first): 4, 2
- Removes port **4** (highest unoccupied)
- Result: ports 1, 2, 3, 5

*Increment by 1 (target = 5, starting from above result):*
- Minimum available ID (gap): **4**
- Adds port **4** back
- Result: ports 1, 2, 3, 4, 5

**Inputs:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `subsystemSystemId` | uint | yes | System ID of the subsystem |
| `inputDataPortCount` | number | no† | Target number of input data ports |
| `outputDataPortCount` | number | no† | Target number of output data ports |

†At least one of `inputDataPortCount`, `outputDataPortCount`, or
`controlPortCount` must be provided.

**Output:** The updated subsystem with the adjusted data ports list.

**Validations:**
- Subsystem must exist.
- Reducing count: unoccupied ports in that direction must be ≥ the reduction amount.
  Occupied ports cannot be removed — I3.
- Supports partial success: if one direction fails, the other may still be updated.

---

#### FR-SS-06: Set control port count

The number of control ports on a subsystem can be adjusted.

**Increasing count:** New control ports are created until the target count is reached.
Each new port is assigned the **minimum available port ID** — the smallest ID not currently
in use. This fills gaps left by previously removed ports before allocating a new higher ID.
Each new port starts with an empty name.

**Decreasing count:** Only **unoccupied** control ports (those with no active control links) may
be removed. Ports are candidates for removal in descending port-ID order (highest ID first).
If there are not enough unoccupied control ports to reach the target count, the operation must fail.

**Endpoint:** `PATCH /arc-api/v1/projects/{projectId}/subsystems/{subsystemSystemId}`

**Example:**

Initial state — 5 control ports, occupied ports: 1, 3, 5 — unoccupied ports: 2, 4

*Decrement by 1 (target = 4):*
- Candidates for removal (unoccupied, highest ID first): 4, 2
- Removes port **4** (highest unoccupied)
- Result: ports 1, 2, 3, 5

*Increment by 1 (target = 5, starting from above result):*
- Minimum available ID (gap): **4**
- Adds port **4** back
- Result: ports 1, 2, 3, 4, 5

**Inputs:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `subsystemSystemId` | uint | yes | System ID of the subsystem |
| `controlPortCount` | number | no† | Target number of control ports |

†At least one of `inputDataPortCount`, `outputDataPortCount`, or
`controlPortCount` must be provided.

**Output:** The updated subsystem with the adjusted control ports list.

**Validations:**
- Subsystem must exist.
- Reducing count: unoccupied control ports must be ≥ the reduction amount — I3.

---

### 3.4 Child Component Management

#### FR-SS-07: Move components

One or more existing components (subgraphs or subsystems) can be moved to any target location
within the project — either into a specific subsystem or to the root graph — in a single
operation.

Set `targetSubsystemSystemId` to a subsystem's system ID to move components into it,
or `null` to move them to the root graph.

Rules by component type:
- **Subgraph:** Re-parented without additional checks. Subgraphs are leaf nodes and cannot
  create a circular hierarchy.
- **Subsystem:** Must not be the target subsystem itself or any of its descendants. Moving a
  subsystem into itself or a descendant creates a circular hierarchy and must fail.

If any component is already a direct child of the target location, the operation must fail
with a duplicate-child error.

Beyond re-parenting, the operation also removes cross-boundary links that become invalid and
constructs new links as needed.

**Endpoint:** `POST /arc-api/v1/projects/{projectId}/subsystems/components/move`

**Inputs:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `subgraphSystemIds` | string[] | no† | System IDs of subgraphs to move |
| `subsystemSystemIds` | string[] | no† | System IDs of subsystems to move |
| `targetSubsystemSystemId` | string \| null | yes | System ID of the target subsystem. `null` moves components to root |

†At least one of `subgraphSystemIds` or `subsystemSystemIds` must be non-empty.

**Output:** A result describing what changed:

| Field | Description |
|-------|-------------|
| `updatedModules` | Modules re-parented by the move (with new `parentSystemId`) |
| `updatedSubsystems` | Subsystems re-parented by the move (with new `parentSystemId`) |
| `addedDataLinks` | Data links constructed after the move |
| `removedDataLinks` | System IDs of data links removed after the move |
| `addedControlLinks` | Control links constructed after the move |
| `removedControlLinks` | System IDs of control links removed after the move |
| `subsystemPortChanges` | Port additions/removals on subsystems whose wiring changed |

**Validations:**
- At least one of `subgraphSystemIds` or `subsystemSystemIds` must be non-empty.
- If `targetSubsystemSystemId` is provided (non-null), the target subsystem must exist.
- Moving a subsystem into itself or a descendant creates a circular hierarchy — must fail.
- All components must belong to this project.

---


## 4. Invariants

**I1 — Global name uniqueness:** No two subsystems within the same project may share a name
(comparison is case-insensitive).

**I2 — Unique child membership:** A given component ID may appear at most once in a subsystem's
child list.

**I3 — Occupied port protection:** Ports with at least one active connection (data or control)
cannot be removed individually or via count reduction.