# Natural ID Generator: Requirements

**Date:** 2026-07-02
**Status:** Frozen

---

## 1. Context

### 1.1 Problem Statement

AudioReach `.acdb` files use type-specific 32-bit numeric IDs — subgraph IDs, container IDs, module instance IDs, subsystem IDs — to identify graph entities. When a user edits a graph (adding or removing subgraphs, containers, modules) the backend must allocate new IDs that:

- Are unique within the file for that entity type
- Fall within a defined numeric range per type
- Respect a per-session monotonicity rule (SUBGRAPH and MODINSTANCE only)
- Account for a per-file VMID namespace that shifts all ranges into a multi-tenant partition

The C# desktop tool has an in-memory `UniqueIDGenerator` for this purpose. This feature implements the equivalent in TypeScript, integrated into the hexagonal architecture of this backend.

### 1.2 What This Builds On

- `packages/core/src/domain/entities/usecase-data/` — Subgraph (`subgraphId`), Container (`containerId`), SpfModule (`instanceId`), and Node/Subsystem entities already exist with natural ID fields.
- `packages/core/src/application/ports/id-generation/id-generation.port.ts` — Existing `IdGenerationPort` pattern for composite/system IDs; the new port follows the same convention.
- `packages/core/src/application/file-operations/upload-file/services/entity-builder-service.ts` — Builds all domain entities from parsed ACDB/AWSP; the injection point for initialising the generator.
- `packages/infrastructure/persistence/src/id-generation/entity-id.service.ts` — Reference for the block-reservation + pending-promise pattern used for concurrency safety.

### 1.3 Key Decisions Already Made

| Decision | Choice | Rationale |
|---|---|---|
| Storage model | Pure in-memory, per-file | VMID remapping and monotonicity watermark are session-scoped state that fight the DB's stateless model |
| Initialization | Populated from `EntityBuilderService` during `upload-file` | All natural IDs are in memory at that point; no extra DB query needed |
| Natural ID timing | Returned immediately from `getNextId` | Edit handlers must return the natural ID in the API response |
| `setVmid` output | Returns `VmidRemapping[]` (before/after mapping) | Caller (command handler) drives the DB bulk-update; generator stays DB-free |
| VMID scope | Per-file | Each file has an independent VMID |
| Server-restart recovery | Lazy re-hydration from DB via `ensureLoaded` callback | Fallback only; primary path is upload-file initialization |
| Concurrency | No locks needed for allocate/register/release | Node.js single-thread makes synchronous ops atomic; only initialization needs the pending-promise guard |

---

## 2. Definitions

| Term | Definition |
|---|---|
| **Natural ID** | The 32-bit unsigned integer ID embedded in an `.acdb` file (e.g. `0xB0000001`). Carries semantic meaning for hardware; distinct from the DB `systemId`. |
| **VMID** | 4-bit value `[0–15]` embedded in bits 24–27 of a natural ID. Partitions the ID namespace per virtual machine so multiple VMs can coexist in the same file. |
| **VMID nibble** | The 4 bits at mask `0x0F000000` in a 32-bit ID. |
| **Session watermark** | Per-type monotonicity cursor for SUBGRAPH and MODINSTANCE. Once set, allocations only move forward; released IDs below the watermark are never reallocated in the same session. |
| **Generator** | A `UniqueIdGenerator` instance, scoped to one file. |
| **Registry** | `NaturalIdRegistry` — the singleton that maps `fileSystemId → UniqueIdGenerator`. |
| **Remapping** | A `{ type, oldId, newId }` record returned by `setVmid` / `resetVmid` so callers can bulk-update the DB. |

---

## 3. Functional Requirements

### 3.1 Entity Types and ID Ranges

#### FR-NIG-01: Entity types
The generator manages IDs for exactly four entity types: `SUBGRAPH`, `CONTAINER`, `MODINSTANCE`, `SUBSYSTEM`.

#### FR-NIG-02: Default ID ranges
When VMID = 0 (baseline), each type has the following inclusive 32-bit unsigned integer range:

| Type | Min | Max |
|---|---|---|
| `SUBGRAPH` | `0xB0000001` | `0xB0FFFFFF` |
| `CONTAINER` | `0xE0000001` | `0xE0FFFFFF` |
| `MODINSTANCE` | `0x00004001` | `0x00FFFFFF` |
| `SUBSYSTEM` | `0xF0000001` | `0xF0FFFFFF` |

---

### 3.2 Core Allocation Operations

#### FR-NIG-03: `allocate(type)` — returns next unused ID
Returns the lowest available ID within the current `[min, max]` range that is not already in the used set (and satisfies the monotonicity constraint if applicable). Marks the returned ID as used. Returns `max + 1` as an overflow sentinel if no valid ID exists within the range.

#### FR-NIG-04: `register(type, id)` — marks a known ID as used
If `id` is within the current `[min, max]` for the type and not already used, adds it to the used set and returns `true`. Returns `false` if `id` is out of range or already used.

#### FR-NIG-05: `release(type, id)` — removes ID from used set
If `id` is in the used set, removes it and returns `true`. Returns `false` if `id` is not in the used set. For SUBGRAPH and MODINSTANCE: if `id > currentWatermark`, advances the watermark to `id` (see FR-NIG-09).

#### FR-NIG-06: `isUsed(type, id)` — membership query
Returns `true` if `id` is currently in the used set for `type`; `false` otherwise.

#### FR-NIG-07: `getRange(type)` — current range query
Returns `{ min, max }` for the type with the current VMID applied. Read-only; no state change.

#### FR-NIG-08: `getRangeForVmid(type, vmid)` — hypothetical range query
Returns `{ min, max }` that would apply for `(type, vmid)` without changing any state. For `SUBSYSTEM`, always returns the fixed baseline range regardless of the supplied `vmid`.

---

### 3.3 Monotonicity Constraint (SUBGRAPH and MODINSTANCE only)

#### FR-NIG-09: Session watermark prevents ID reuse
SUBGRAPH and MODINSTANCE maintain a session watermark initialised to `0` (unset).

During `allocate`:
- If watermark is unset (`0`): find the lowest unused ID in `[min, max]`, set the watermark to it, and return it.
- If watermark is set: find the lowest unused ID in `[min, max]` that is **strictly greater** than the current watermark, set the watermark to it, and return it.

#### FR-NIG-10: Release advances watermark
During `release(type, id)` for SUBGRAPH or MODINSTANCE: if `id > currentWatermark`, advance the watermark to `id`. This ensures the released ID is not reallocated within the same session.

CONTAINER and SUBSYSTEM have no watermark; freed IDs may be reallocated immediately.

---

### 3.4 VMID Lifecycle

#### FR-NIG-11: `setVmid(vmid)` — apply VMID encoding
Accepts a VMID value `v` in `[0, 15]`. Returns `{ success: false, remappings: [] }` if `v` is out of range.

On success:
- Recalculates `[min, max]` for SUBGRAPH, CONTAINER, MODINSTANCE by applying `v` to the VMID nibble of each boundary.
- Remaps every tracked ID in the used sets of those three types by applying `v` to their VMID nibble.
- Stores `v` as the active VMID.
- Returns `{ success: true, remappings: VmidRemapping[] }` where each entry is `{ type, oldId, newId }` for every ID that changed value.
- SUBSYSTEM range boundaries and tracked IDs are unchanged.

#### FR-NIG-12: `resetVmid()` — restore VMID = 0 encoding
Applies VMID = 0 to range boundaries and all tracked IDs of SUBGRAPH, CONTAINER, MODINSTANCE. Stores the sentinel `0xFFFFFFFF` as the active VMID to distinguish "reset" from "VMID explicitly set to 0". Returns `VmidRemapping[]` for DB update. SUBSYSTEM unaffected.

#### FR-NIG-13: `getVmid()` — query active VMID
Returns the currently active VMID value, or `0xFFFFFFFF` if no VMID has been set (initial state or after `resetVmid`).

---

### 3.5 VMID Encoding Rule

#### FR-NIG-14: VMID nibble encoding
The VMID nibble sits at bits 24–27 of a 32-bit ID (mask `0x0F000000`).

- **Extract VMID from an ID:** `(id >>> 24) & 0x0F`
- **Apply VMID to an ID:** `(id & 0xF0FFFFFF) | ((vmid << 24) & 0x0F000000)`

The baseline ranges already encode VMID = 0 (the nibble is zero in all baseline values).

---

### 3.6 Registry and File Scoping

#### FR-NIG-15: Per-file generator
The registry (`NaturalIdRegistry`) holds one `UniqueIdGenerator` per `fileSystemId`. Generators for different files are fully independent.

#### FR-NIG-16: Initialization during upload-file
After `EntityBuilderService` finishes building all domain entities from a parsed file, it calls `registerBatch(fileSystemId, entries[])` to pre-populate the generator for that file with all existing natural IDs before any edit command can run.

#### FR-NIG-17: `getNextId(fileSystemId, type)` — allocate for a file
Delegates to the per-file generator's `allocate(type)`. Returns the natural ID synchronously. Must not perform any DB I/O.

#### FR-NIG-18: `release(fileSystemId, type, id)` — unmark on entity delete
Called by delete command handlers after removing an entity from the DB. Delegates to the per-file generator's `release(type, id)`.

---

### 3.7 Lazy Re-hydration Fallback (Server Restart Recovery)

#### FR-NIG-19: `ensureLoaded(fileSystemId, loader)` — re-hydrate after restart
If the generator for `fileSystemId` is not in memory (server restarted), accepts an async `loader` callback that returns `Array<{ type, id }>` by querying the DB. Populates the generator via `registerBatch`. Concurrent callers awaiting the same file coalesce onto a single loader invocation (pending-promise guard). No-ops if the generator is already loaded.

---

### 3.8 Diagnostics

#### FR-NIG-20: `lastUsedId(type)` — most recently used ID
Returns the most recently allocated or released ID for the type (per-file generator).

#### FR-NIG-21: `lastUsedTimestamp(type)` — timestamp of last event
Returns the ISO 8601 timestamp string of the last `allocate` or `release` event for the type.

#### FR-NIG-22: `getMax(type)` — highest tracked ID
Returns the highest ID currently in the used set for the type, or `0` if the set is empty.

---

## 4. Invariants

**I1 — Range integrity:** Every ID in the used set for a type is within the current `[min, max]` for that type at all times.

**I2 — Uniqueness:** No ID appears more than once in the used set for any given type.

**I3 — VMID consistency:** After `setVmid(v)`, every ID in the used sets of SUBGRAPH, CONTAINER, MODINSTANCE encodes `v` in its VMID nibble, and their range boundaries also encode `v`. SUBSYSTEM IDs and boundaries are unchanged.

**I4 — Watermark monotonicity:** The session watermarks for SUBGRAPH and MODINSTANCE never decrease.

**I5 — Watermark coverage:** Any ID at or below the watermark is never returned by `allocate` for SUBGRAPH or MODINSTANCE.

**I6 — Allocate-then-isUsed consistency:** An ID returned by `allocate` is immediately reflected in `isUsed` as `true`.

---

## 5. Non-Functional Requirements

**NFR-NIG-01:** The `UniqueIdGenerator` class has no DB access, no NestJS imports, no Node.js API calls. It is a pure in-memory value object usable in any environment.

**NFR-NIG-02:** `allocate`, `register`, `release`, `isUsed`, `getRange`, `setVmid`, `resetVmid` are all synchronous. `getNextId` and `release` on the registry are synchronous. Only `ensureLoaded` is async.

**NFR-NIG-03:** All natural IDs must be logged via `BinaryUtils.toHexString()` as per the project logging convention.

**NFR-NIG-04:** The registry is registered as a singleton NestJS provider so the in-memory state survives across requests within the same server process.

---

## 6. Out of Scope

- Persisting generator state to disk or DB (generator is ephemeral; DB is ground truth for IDs).
- Notifying consumers when IDs are allocated or released.
- Enforcing that a released ID was previously allocated by this generator instance.
- Cross-type uniqueness (same numeric value may appear in different types' used sets).
- Thread safety beyond the pending-promise guard for initialization (Node.js single-thread guarantee).
- Bulk VMID DB update logic — the registry returns remappings; the command handler owns the DB update.

---

## 7. Open Questions

None — all resolved during the design session.
