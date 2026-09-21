<!--
  Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
  SPDX-License-Identifier: BSD-3-Clause
-->

# Requirements: Container Property Write API

**Feature folder:** `docs/property-data/`
**Status:** DRAFT
**Date:** 2026-08-18
**Reference:** `docs/property-data/design/property-write-api-design.md`

---

## Context

One write endpoint for managing container properties in the AudioReach usecase designer. Container properties control runtime behaviour of a container — its heap allocation, processor domain, stack size, graph position, parent container, and supported module types (capabilities).

Each property is stored as a separate row, keyed by container and property. All writes are staged and not applied to the canonical data until the caller invokes commit.

---

## Definitions

| Term | Meaning |
|---|---|
| ContainerPropertyData | One row per property per container. |
| PropertyDefinition | Defines a property — its name, valid values, and element structure. |
| Capability List | Property `0x08001011` — the list of container type IDs the container supports. Also referred to as Container Type. |
| Container Heap | Property `0x08001174` — the heap ID the container uses. Values: Default (`0x1`), Low Power (`0x2`). |
| Module Heap | Property on each module — the heap ID the module uses. Values: Default (`0x1`), Low Power (`0x2`), Low Power 2 (`0x3`). |
| Heap Cascade | When Container Heap is set to Low Power, all modules in the container have their Module Heap forced to the same value. |
| Staged write | A pending change that is visible via overlay read but not yet committed to the canonical table. |

---

## Functional Requirements — PATCH /containers/:id/properties/:propSystemId

### FR-CP-01 — Endpoint definition

`PATCH /arc-api/v1/projects/:projectId/containers/:containerSystemId/properties/:propertySystemId`

Request body:

```json
{
  "elements": ParameterElementSummaryDto[]
}
```

Example for Stack Size (`0x08001013`):

```json
{
  "elements": [
    {
      "type": "ConfigElement",
      "name": "stack_size",
      "value": "1024"
    }
  ]
}
```

### FR-CP-02 — Container existence

`containerSystemId` must refer to a non-deleted container in the session's file. → `404` if not found.

### FR-CP-03 — Property definition existence

`propertySystemId` must refer to a property definition in the session's file. → `404` if not found.

### FR-CP-04 — Capability list validation

When `propertySystemId` resolves to the capability list property (`0x08001011`):

1. Fetch all non-deleted modules belonging to the container.
2. For each unique module definition, get its supported container type IDs.
3. Check that the intersection of the module's supported types and the incoming capability IDs is **non-empty** for every module.
4. If any module fails the intersection check, reject the entire write → `422` with a message listing the failing module display names:

```
Module capability and container capability are not matching with following Modules:
"<ModuleDisplayName1>"
"<ModuleDisplayName2>"
```

Only if all modules pass does the write proceed.

### FR-CP-05 — Container Heap cascade

When `propertySystemId` resolves to Container Heap (`0x08001174`):

- **Default (`0x1`):** no cascade — module heap IDs are left as-is.
- **Low Power (`0x2`):** for every non-deleted module in the container, Module Heap must be updated to Low Power (`0x2`).

The container property write and all module heap writes are treated as one atomic operation.

### FR-CP-06 — Staged write

The property update must be staged. The staged change must be visible immediately via overlay read before commit.

### FR-CP-07 — Response

Handler returns `void`. Controller re-queries the updated property via a new `GetContainerPropertyQuery` (singular — takes `containerSystemId` + `propertySystemId`) and returns `PropertyResponseDto` for the single updated property. → `200`.

---

## Cross-Cutting Requirements

### FR-CCR-01 — Edit session required

The write endpoint requires an active edit session for the project. → `422` if no session is open.

### FR-CCR-02 — Staging model

All writes are staged. Changes are not committed to the canonical tables until the caller invokes `PATCH /projects/:projectId/commit`.

### FR-CCR-03 — Session overlay for reads

Staged (uncommitted) writes must be reflected in responses immediately after the write.

---

## Invariants

| # | Invariant |
|---|---|
| I1 | A property written multiple times in the same session results in only one effective value — the latest write wins. |
| I2 | Container Heap cascade and the triggering container property write are atomic — either all module heap updates succeed or none are applied. |
| I3 | Capabilities write is rejected if any module in the container does not support at least one of the incoming capability IDs. |

---

## Error Codes Summary

| Scenario | HTTP Code |
|---|---|
| Container not found | 404 |
| Property definition not found | 404 |
| No active session | 422 |
| Invalid property value | 400 |
| Module/capability intersection check fails | 422 |

---

## Out of Scope

- **Stack Size auto-update** — triggered only when a module is added to a container, not on direct property edit. Handled by the Add Module flow.
- **Proc Domain** — read-only; no write endpoint needed.
- **Container ID change** — handled by `PATCH /subgraphs/:id/container-id`.
- **Commit / undo / redo** — session lifecycle handled by the modification framework, not by these endpoints.
