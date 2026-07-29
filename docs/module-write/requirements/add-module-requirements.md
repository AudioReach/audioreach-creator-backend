<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Add Module — Requirements

**Date:** 2026-07-30
**Status:** Draft

**Parent:** `docs/edit-crud/overall-design.md`
**Prior art:** `docs/edit-crud/module-write-path.md` (LLD2) §2 REQ-ADD-01–08, `C:\Workspaces\qact.win.8.3.qact_83_ref\QACT\Documentation\requirements\module\add-module.md`

---

## 1. Scope

This document consolidates requirements for the `POST /projects/:projectId/spf-modules` (Add Module) endpoint. It extends LLD2's original REQ-ADD scope with requirements gathered from the external add-module requirements doc, reconciling or flagging any contradictions.

**Included in this plan:**
- Core three-variant creation logic (LLD2 REQ-ADD-01–03, REQ-ADD-05–08)
- `isExported` → `isImported` rename on Subgraph
- Imported-subgraph guard (FR-AM-03/07)
- Module-container type compatibility check for provided containers (FR-AM-09)
- Heap property on SpfModule (FR-AM-12) — new column
- Container stack size update after module placement (FR-CSS-02/03)
- Container stack size update when PATCH changes `containerSystemId` (FR-CSS-08) — handled by a shared `ContainerStackSizeService` used by both AddModule and PatchSpfModuleHandler
- Container stack size recalculation on module removal (FR-CSS-06) — AddModule plan delivers the service; LLD5 calls into it for the remove path

**Explicitly deferred (not in this plan):**
- Calibration data seeding at zero CKV (FR-AM-11 / REQ-ADD-04 / OQ-1) — separate LLD
- Dynamic port auto-creation (FR-AM-13/14/15) — dynamic ports are user-triggered via PATCH
- Subgraph/Container property-data defaults beyond stack size and heap property (OQ-1) — separate LLD

---

## 2. Core Creation Requirements (from LLD2)

### REQ-ADD-01: Three creation variants

The handler accepts three forms based on which optional IDs are null:

| Variant | subgraphSystemId | containerSystemId | Effect |
|---------|-----------------|-------------------|--------|
| 1 | null | null | Auto-create both Subgraph and Container |
| 2 | provided | null | Validate provided Subgraph; auto-create Container |
| 3 | provided | provided | Validate both |

### REQ-ADD-02: Default subgraph name

When auto-creating a Subgraph, its default name is `SG_<subgraphId>` where `subgraphId` is the natural ID assigned by `NaturalIdGenerationPort`.

### REQ-ADD-03: Container type resolution

When auto-creating a Container, use the first entry in `SpfModuleDefinition.containerTypesSystemIds` as the `containerTypeSystemId`. If the set is empty, `containerTypeSystemId` is null.

### REQ-ADD-05: Definition lookup

The system loads the module definition by `(moduleId, procId, fileSystemId)`. If no definition is found, the operation fails with a 404 response.

### REQ-ADD-06: Static port materialization

On creation, the system materialises static DataPorts from `definition.dataPortGroups[*].staticPortDefinitions[]` and static ControlPorts from `definition.staticControlPorts[]`. Port natural IDs (`dataPortId`, `portId`) come from the definition, not from `NaturalIdGenerationPort`. Dynamic port slots (groups where `maxAllowedPortCount > 0` but `staticPortDefinitions` is empty) are left empty at creation; dynamic ports are added by the user via PATCH.

### REQ-ADD-07: API-call atomicity

All edit_actions rows produced by one AddModule call (Subgraph, Container, Node, SpfModule, DataPorts, ControlPorts) share the same `groupId` from `WriteContext` — forming a single undo/redo/stage/unstage atomic unit.

### REQ-ADD-08: Multi-aggregate spanning

Each aggregate root (Subgraph, Container, SpfModule) gets its own `aggregateId` in `edit_actions`. Rows for the module's children (Node, DataPorts, ControlPorts) use the module's `systemId` as `aggregateId`.

---

## 3. Subgraph Rename Requirement

### REQ-RENAME-01: isExported → isImported

The field `isExported` on the `Subgraph` domain entity, TypeORM schema, migration, and all call sites is renamed to `isImported`. The boolean semantics are unchanged (true = the subgraph originated from an external/imported file and is treated as read-only for structural changes). This rename is included in the add-module plan since it is needed for the import guard (§4).

---

## 4. Imported Subgraph Guard (from FR-AM-03 + FR-AM-07)

### REQ-GUARD-01: Reject placement into imported subgraph

When a `subgraphSystemId` is provided (Variants 2 and 3), the system checks `subgraph.isImported`. If `true`, the operation is rejected with a 422 issue code `ARC-MOD-SUBGRAPH-IMPORTED` and an appropriate message. Users cannot add or remove components from an imported subgraph; calibration operations are allowed but out of scope here.

Auto-created subgraphs (Variant 1) are always created with `isImported = false` and never need this check.

---

## 5. Module-Container Compatibility (from FR-AM-09)

### REQ-COMPAT-01: Container type check for provided container

When a `containerSystemId` is provided (Variant 3), the system reads the container's `containerTypeSystemId` and verifies it appears in `definition.containerTypesSystemIds`. If the container's type is not in the allowed set, the operation is rejected with 422 issue code `ARC-MOD-CONTAINER-TYPE-INCOMPATIBLE` (same code used in PatchSpfModuleHandler §11.1.a of LLD2).

Auto-created containers (Variants 1 and 2) pick `containerTypesSystemIds[0]`, which is always compatible by construction.

---

## 6. Heap Property on SpfModule (from FR-AM-12)

### REQ-HEAP-01: New heap_property column

A new integer column `heap_property` is added to the `spf_modules` entity table and domain entity. It stores the heap property value as a uint32 (Qualcomm convention: `0x1` = 4-byte little-endian value `01 00 00 00`). The migration regenerates the `initial-create` migration (no separate migration).

### REQ-HEAP-02: Heap value at creation

When creating a new SpfModule:
- The system reads the container's heap property from `container_property_data` using the fixed heap property definition systemId constant.
- If a heap property row exists for that container, its blob value (uint32 LE) is used.
- Otherwise, the default heap value `0x1` (= numeric 1) is used.

The heap value is staged as part of the SpfModule CREATE row in `edit_actions`.

---

## 7. Container Stack Size (from FR-CSS-02, FR-CSS-03, FR-CSS-06, FR-CSS-08)

Stack size logic appears in three write paths (AddModule, PatchSpfModuleHandler, future DeleteModule). To avoid duplication, a shared `ContainerStackSizeService` encapsulates all three operations. Both AddModule and PATCH handlers call into this service rather than managing stack size inline.

### REQ-CSS-01: Stack size at auto-created container

When a container is auto-created (AddModule Variants 1 and 2), its stack size property is initialised to the module definition's `stackSize` value. If the definition does not declare a stack size (null / 0), the initial value is `0`.

The stack size is stored as a `container_property_data` row (blob, uint32 LE) identified by the fixed stack-size property definition systemId constant.

### REQ-CSS-02: Stack size update on add to existing container

When a module is added to an existing container (AddModule Variant 3), the system reads the container's current stack size. If `definition.stackSize > currentStackSize`, the system stages an UPDATE on the stack size property row. If `definition.stackSize ≤ currentStackSize`, the property is left unchanged.

### REQ-CSS-03: Stack size update on container reassignment (PATCH)

When `PatchSpfModuleHandler` changes a module's `containerSystemId` (FR-CSS-08):
- **Old container:** the module is effectively removed from it. A full recalculation is staged: scan all modules remaining in that container, set stack size to the maximum of their declared stack sizes (or `0` if none remain).
- **New container:** compare-and-set exactly as in REQ-CSS-02 using the moved module's `stackSize`.

### REQ-CSS-04: Stack size recalculation on remove (for LLD5)

The `ContainerStackSizeService` delivers a `recalculateForContainer(containerSystemId, fileSystemId, uow)` method for use by the Delete Module handler (LLD5). It performs the full scan (FR-CSS-06): scans all modules remaining in the container and stages a stack size UPDATE to the maximum value found.

This method is written and tested in this plan so LLD5 can call it without re-implementing the logic.

---

## 8. ContainerStackSizeService

### REQ-SVC-01: Shared service in @arc/core

A `ContainerStackSizeService` is introduced in `@arc/core` (application layer, not domain — it orchestrates port calls). It is injected into `AddModuleHandler` and `PatchSpfModuleHandler` via constructor injection. LLD5's `DeleteModuleHandler` will also inject it.

The service exposes three methods:

```ts
// Called by AddModule for auto-created containers
initializeStackSize(
  containerSystemId: number,
  moduleStackSize: number,
  uow: UnitOfWork,
): Promise<void>

// Called by AddModule for existing containers and PATCH new-container path
updateOnAdd(
  containerSystemId: number,
  moduleStackSize: number,
  fileSystemId: number,
  uow: UnitOfWork,
): Promise<void>

// Called by PATCH old-container path and future LLD5 remove path
recalculateForContainer(
  containerSystemId: number,
  fileSystemId: number,
  uow: UnitOfWork,
): Promise<void>
```

The service reads stack size property data and module stack sizes via new port methods on `IContainerEditRepository` and a new `IModuleStackSizeReadRepository` (or extends the existing `IModuleEditRepository` with a read method). It writes the updated property row via the existing `IContainerEditRepository`.

### REQ-SVC-02: Port methods for stack size

New port methods are needed to support the service:
- `IContainerEditRepository.getStackSizePropertyValue(containerSystemId, fileSystemId): Promise<number>` — reads current stack size blob, returns numeric value (0 if no property row exists).
- `IContainerEditRepository.setStackSizePropertyValue(containerSystemId, newValue, uow, options?)` — stages the property row UPDATE/CREATE.
- A read-only method to enumerate all modules in a container with their definition's `stackSize` — needed for `recalculateForContainer`. This could be a new method on `IModuleEditRepository` (read side) or a dedicated read port; the exact shape is a design decision (§ Design section).

---

## 9. Session and Mode Requirements

The `AddModuleCommand` declares `allowedModes = [SESSION_MODE.Designer, SESSION_MODE.DiffMerge]` per REQ-SESS-07. The `SessionGuard` must be applied to the endpoint. The `CommandBus` enforces mode compliance before invoking the handler.

`PatchSpfModuleHandler` already declares the same allowed modes. The stack size update for PATCH is part of the existing PATCH flow — no new mode declaration needed.

---

## 10. Existence Validations (from REQ-VAL-01/02)

In order of execution within `AddModuleHandler`:
1. Definition not found → 404 (`IssueFactory.notFound(ISSUE_ENTITY_TYPE.SpfModuleDefinition, ...)`).
2. `parentId` subsystem not found → 404 (`ISSUE_ENTITY_TYPE.Subsystem`).
3. Provided `subgraphSystemId` not found → 404 (`ISSUE_ENTITY_TYPE.Subgraph`).
4. Provided `subgraphSystemId` is imported → 422 `ARC-MOD-SUBGRAPH-IMPORTED`.
5. Provided `containerSystemId` not found → 404 (`ISSUE_ENTITY_TYPE.Container`).
6. Provided `containerSystemId` type-incompatible → 422 `ARC-MOD-CONTAINER-TYPE-INCOMPATIBLE`.

All checks run before any staging. Any failure rolls back the transaction.

For `PatchSpfModuleHandler`, when `containerSystemId` changes:
- New container existence and type-compatibility checks remain as-is (§11.1.a of LLD2).
- Stack size update is applied after the container change is validated and staged.

---

## 11. Invariants

**I-ADD-01 — Subgraph consistency:** A module instance always belongs to exactly one non-imported subgraph that exists at creation time.

**I-ADD-02 — Container consistency:** A module instance always belongs to exactly one container of a compatible type.

**I-ADD-03 — Heap property present:** Every newly created SpfModule has a `heap_property` value set before the operation returns.

**I-ADD-04 — Container stack size reflects maximum:** After any module-placement or module-container-reassignment operation, the container's stack size property equals the maximum declared stack size across all modules it hosts.

---

## 12. Out of Scope

- Calibration data seeding (FR-AM-11 / REQ-ADD-04) — deferred to a follow-up LLD.
- Dynamic port auto-creation (FR-AM-13/14/15) — dynamic ports are user-triggered via PATCH.
- Container stack size on module removal (FR-CSS-06) — the service method is delivered here; LLD5 calls it.
- Subgraph / Container property-data defaults beyond stack size and heap property — OQ-1.

---

## 13. Open Questions

**OQ-1 (inherited from LLD2):** Property-data seeding for auto-created Subgraphs and Containers (beyond stack size and heap property) — deferred to a dedicated LLD.

**OQ-2 (resolved):** The fixed property system IDs are `CONTAINER_PROPERTY_SYSTEM_IDS.STACK_SIZE = 0x08001013` (`CONTAINER_PROP_ID_STACK_SIZE`) and `CONTAINER_PROPERTY_SYSTEM_IDS.HEAP = 0x08001174` (`CONTAINER_HEAP_PROP_ID`). Stored as constants in `packages/core/src/domain/entities/usecase-data/container/container-property-ids.ts`.

**OQ-3 (new — from external add-module.md OQ-1):** If a transaction fails after Subgraph/Container CREATE rows are staged but before the module is staged, the DB transaction rollback clears all staged rows automatically. No explicit cleanup is needed. Resolved.

**OQ-4 (new):** For `recalculateForContainer`, the full scan reads all modules remaining in the container via a new read-only port. Should this port be a new standalone interface (e.g., `IContainerModulesReadRepository`) or a new method on the existing `IModuleEditRepository`? Decision left to the design phase.
