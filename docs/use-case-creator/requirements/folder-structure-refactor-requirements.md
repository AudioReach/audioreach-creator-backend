<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Use-Case Creator Folder Structure Refactor: Requirements

**Date:** 2026-09-27
**Status:** Frozen
**Scope:** Targeted structural refactor of the use-case creator routing pipeline.

## 1. Context

### 1.1 Problem statement

The use-case creator routing pipeline has meaningful phases, but phase-specific
implementation details are mixed between large phase files, generic supporting
service folders, and shared contracts. Several phases contain multiple distinct
responsibilities, making ownership and navigation harder than necessary.

### 1.2 What this builds on

- The existing 12-step `RoutingEngine` pipeline.
- The existing `phases/`, `contracts/`, `services/`, and `shared/` boundaries.
- The phase-by-phase analysis recorded during this session.
- The draft design at `docs/use-case-creator/design/folder-structure-refactor-design.md`.

### 1.3 Scope decision

This is a targeted refactor. Small, cohesive phases remain flat. Phase folders
and collaborator extraction are introduced only where they provide a meaningful
ownership or navigation boundary.

## 2. Definitions

| Term | Definition |
|------|------------|
| Phase | A workflow stage invoked directly by `RoutingEngine` in the fixed routing sequence. |
| Phase façade | The public entry point for one phase; it coordinates phase collaborators and owns the `RoutingContext` interaction. |
| Phase-private type | A type used only by one phase or its internal collaborators. |
| Cross-phase contract | A type stored in `RoutingContext` or consumed by more than one phase. |
| Supporting service | A capability used by a phase or handler that does not own workflow sequencing. |

## 3. Functional Requirements

### 3.1 Phase organization

#### FR-FSR-01: Make workflow phases identifiable

Every module directly invoked by `RoutingEngine` shall be identifiable as a
routing phase by its location and naming. The chosen convention shall be applied
consistently to all twelve phases.

#### FR-FSR-02: Preserve cohesive phases as single modules

The following phases shall remain flat single-module implementations unless the
design identifies a concrete new boundary:

- Pre-validation
- KV resolution
- Seed detection
- Cone computation
- Classification
- Orphan validation
- Response building

#### FR-FSR-03: Decompose bloated phases by responsibility

The following phases shall retain a phase-level façade and extract meaningful
internal collaborators where their current responsibilities are materially
distinct:

- Topology-change analysis
- Island transition
- DFS routing
- Combination expansion
- Routing-change staging

Each extracted collaborator shall have one clear responsibility and a name that
describes that responsibility.

#### FR-FSR-04: Keep phase-private types with their owner

Types used only within one phase shall move beside the phase implementation or
its internal collaborator. They shall not be placed in a generic `common/`,
`utils/`, or unrelated shared module.

#### FR-FSR-05: Preserve cross-phase contracts

Types exchanged through `RoutingContext` or consumed by multiple phases shall
remain in `contracts/` or another explicitly shared contract location. The
refactor shall not duplicate or weaken those contracts merely to colocate them
with a producing phase.

### 3.2 Dependency and behavior preservation

#### FR-FSR-06: Preserve the routing pipeline

The `RoutingEngine` shall execute the same twelve phases in the same order, with
the same inputs, outputs, failure behavior, warnings, and context mutations.

#### FR-FSR-07: Preserve package boundaries

The refactor shall preserve the core package rule: `packages/core` shall not
import NestJS, TypeORM, or Node.js APIs. Ports, domain types, and existing
application-layer boundaries shall remain unchanged unless required solely for
the structural move.

#### FR-FSR-08: Preserve internal phase entry contracts

Each phase façade shall retain the behaviorally equivalent `run` contract used
by `RoutingEngine`. Internal collaborator APIs may change as needed to create
clear boundaries.

#### FR-FSR-09: Avoid compatibility shims without consumers

The refactor shall not add re-export or legacy-compatibility files unless an
actual consumer outside the refactored feature requires the old path or symbol.

### 3.3 Migration completeness

#### FR-FSR-10: Update all affected references

Source imports, factory wiring, constructor names, tests, test fixtures, and
documentation references affected by moves or renames shall be updated. TypeScript
ESM `.js` import extensions shall remain correct.

#### FR-FSR-11: Retain test ownership

Tests shall follow the production ownership boundary. Extracted collaborators
shall have focused unit coverage when their behavior can be tested independently;
existing phase and routing-chain coverage shall continue to exercise the façade.

#### FR-FSR-12: Verify the refactor

The implementation shall be verified with focused use-case creator tests, the
core unit suite, build, lint, and formatting checks as supported by the repository.

## 4. Invariants

**I1 — No behavior change:** Routing decisions, emitted changes, warnings,
failures, response payloads, and persistence interactions remain unchanged.

**I2 — Stable phase order:** The twelve phases execute in their current order.

**I3 — Single ownership:** Each phase-private type and algorithm has one clear
owning module.

**I4 — Contract integrity:** Cross-phase contracts remain explicit and are not
duplicated into phase-private modules.

**I5 — Dependency direction:** The refactor does not introduce framework or
infrastructure dependencies into `packages/core`.

## 5. Non-Functional Requirements

**NFR-FSR-01 — Navigation:** A developer should be able to identify whether a
module is a phase façade, a phase collaborator, a supporting service, or a shared
rule from its path and name without reading the entire implementation.

**NFR-FSR-02 — Reviewability:** The change shall be separable into mechanical
file moves/renames and behavior-preserving extractions where practical, so
regressions can be reviewed and diagnosed.

**NFR-FSR-03 — Runtime neutrality:** The refactor shall not add a runtime layer,
reflection mechanism, repository call, pipeline stage, or additional traversal
of routing data. Code inspection and existing behavior tests are sufficient
verification for this pure structural refactor; a new benchmark is not required.

## 6. Out of Scope

- Changes to routing algorithms or business rules.
- Changes to HTTP endpoints, DTOs, persistence schemas, or database migrations.
- Redesign of `RoutingContext` or the cross-phase routing protocol.
- Reorganization of every supporting service into new capability folders.
- Broad restructuring of `shared/` beyond moving clearly phase-private code.
- Introducing a new generic `Phase` abstraction solely for naming consistency.
- Reworking handler registries or unrelated known architectural TODOs.

## 7. Open Questions

**OQ-1:** Should phase modules use `*.phase.ts` and `*Phase` naming, or should
existing `*.service.ts` and service-class names be retained while folders provide
the phase distinction? Resolve in the design based on migration cost and the
existing draft.

**OQ-2:** For phases 3, 7, 8, and 11, which extracted collaborators justify
separate files without creating excessive fragmentation? Resolve from the
phase-by-phase responsibility analysis and test boundaries.

**OQ-3:** Should one-file phase folders be used for all twelve phases, or should
only phases with extracted collaborators receive subfolders? Resolve using
navigation benefit versus directory overhead.
