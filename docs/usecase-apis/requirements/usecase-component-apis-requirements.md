<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Usecase Component APIs: Requirements

**Date:** 2026-07-14
**Status:** Draft
**Endpoints covered:**
- `POST /arc-api/v1/projects/{projectId}/usecases/components/query-with-subsystems`
- `GET /arc-api/v1/projects/{projectId}/usecases/filtered-by-subsystem`
- Get Subgraph Components — not yet in `docs/swagger-api.json`; core-layer scope only, REST route deferred to API-layer design (see §D)

Each endpoint has its own numbered Definitions / Functional Requirements / Invariants / NFR / Out of Scope / Open Questions subsection below (§B, §C, §D). Requirement IDs are prefixed per endpoint (`QWS-`, `FBS-`, `SGC-`) so they stay unambiguous when cross-referenced from design docs or from each other.

---

## A. Shared Foundations

Context and decisions that apply across more than one of the three endpoints below. Endpoint-specific context lives in that endpoint's own subsection.

### A.1 Shared building blocks

- `nodes.parentId` — the real subsystem-nesting chain. A node's `parentId` is the systemId of its immediate parent subsystem, or `null`/absent at the top level. Used by §B (query-with-subsystems) and §C (filtered-by-subsystem).
- `use_case_subgraphs` / `use_case_subgraph_pairs` — existing usecase→subgraph scoping used by `DbUseCaseQueryService.getAllComponentsForUseCases` (the flat `/usecases/components/query` endpoint) to determine which modules and links belong to a usecase. Used by §B and §C for usecase-to-module reachability, and referenced (but explicitly *not* consulted) by §D.
- `spf_modules.subgraph_system_id` — every module knows its own subgraph directly. Used by §C and §D as the primary scoping column.
- `docs/usecase-components-query-design.md` — CQRS flow and edit-session overlay design for the existing flat `/usecases/components/query` endpoint. All three endpoints below reuse this overlay pattern (STAGED-only, `edit_actions` resolved before scoping/tree-assembly runs).
- `../tree-traversal-decision.md` — shared decision: TypeORM's tree-entity feature cannot be used against our adjacency-list `nodes.parentId` schema (only `closure-table`/`nested-set`/`materialized-path` get TypeORM's `TreeRepository` tooling, and none of those solve root-discovery-from-scattered-leaves or pruning even if adopted). Subsystem hierarchy traversal is always in-memory batch-load-then-traverse. Applies to §B and §C; not applicable to §D (no tree involved).

### A.2 Shared decisions

- **Edit-session overlay applies to all three endpoints**, same STAGED-only pattern (`change_status = 'STAGED' AND valid_until IS NULL`) as the existing flat `/usecases/components/query`.
- **Unrecognized/invalid IDs fail the whole request** for §B and §C (no partial/207 success) — a deliberate divergence from the existing flat `/query` endpoint's 207 partial-success behavior. §D is a single-entity lookup, so an unrecognized ID is a straightforward not-found failure rather than a partial-batch question.
- **Scoping rules differ between §B/§C and §D on purpose:** §B and §C reach modules via usecase → `use_case_subgraphs`, which is usecase-based and subgraph-agnostic. §D reaches modules directly via `subgraph_system_id` and explicitly excludes anything crossing a subgraph boundary, even when a `use_case_subgraph_pairs` row exists connecting the two subgraphs for some usecase. These are not the same "in scope" — do not conflate them when implementing.
- `data-link` / `control-link` component+port lookup endpoints (`GET /usecases/data-link`, `GET /usecases/control-link`) and `modifications-summary` — explicitly out of scope for this document; separate requirements passes.

---

## B. `POST /usecases/components/query-with-subsystems`

### B.1 What this builds on (endpoint-specific)

- `subsystem_data_links` / `subsystem_control_links` — precomputed boundary-segment tables (populated by `DatalinkChainResolutionService` / `ControlChainResolutionService` at data-link/control-link creation time) that already split a cross-subsystem-boundary link into per-boundary segments, each with its own `data_link_system_id` / `control_link_system_id` pointing back to the real link row.
- `ComponentCollectionWithSubsystemsDto` / `SubsystemDto` — DTOs already defined in `packages/api/src/presentation/rest/common/dto/component-collection-with-subsystems.dto.ts` and `packages/api/src/presentation/rest/modules/subsystem/dto/subsystem.dto.ts`. `SubsystemDto.children` is itself a `ComponentCollectionWithSubsystemsDto`, so the DTO shape is already recursive.
- `docs/superpowers/specs/subsystem-query-lld.md` — unimplemented LLD for `POST /subsystems/query`, which independently designed the "build a subsystem tree in-memory from one batch load, recurse to leaf" pattern for a *subsystem-ID-rooted* query. This endpoint adapts that pattern for a *usecase-scoped* query, where roots are discovered rather than given.

### B.2 Key decisions already made

- Response DTO is `ComponentCollectionWithSubsystemsDto` (already defined) — flat `spfModules` / `dataLinks` / `controlLinks` arrays at every level, plus a `subsystems: SubsystemDto[]` array whose entries recurse via `children`.
- The subsystem tree is pruned to usecase scope: a subsystem node appears in the response only if at least one usecase-scoped module lives at or beneath it. Branches with no in-scope leaf are omitted entirely.
- The tree is built to full depth (recurse to leaf) in every response — no depth limiting.
- Component dedup across requested usecases: if the same module/subsystem/link is reachable from more than one requested usecase, it appears once in the response (same "shared components appear once" rule as `/query`).
- `isDangling` is out of scope for this pass — hardcoded to `false`, matching the current flat `/query` implementation's behavior. No new dangling-link detection logic is introduced.

### B.3 Definitions

| Term | Definition |
|------|------------|
| Node | A row in `nodes` — either a module or a subsystem. Has `parentId` pointing to its immediate parent subsystem node, or none if top-level. |
| Subsystem | A node of type `subsystem`. Has a 1:1 `subsystems` row (name, filtered keys). |
| Module | A node of type `module`. Has a 1:1 `spf_modules` row. |
| Root subsystem | A subsystem node with no `parentId` (top-level) that is included in the response because it or a descendant contains an in-scope module. |
| In-scope module | A module reachable from the requested usecase system IDs via `use_case_subgraphs` (same scoping as the flat `/query` endpoint). |
| Boundary-crossing link | A data/control link whose two endpoint modules do not share the same immediate parent — i.e., the link crosses one or more subsystem boundaries. Represented in `subsystem_data_links` / `subsystem_control_links` as one segment per boundary crossed. |
| Tree level | The set of components (modules, subsystems, links) that are direct children of one particular subsystem (or the top level, for the response root). |

### B.4 Functional Requirements

#### B.4.1 Request / response shape

**QWS-01 — Endpoint signature unchanged:** `POST /arc-api/v1/projects/{projectId}/usecases/components/query-with-subsystems`, body `{ systemIds: string[] }` (usecase system IDs), matching the existing controller stub and swagger spec.

**QWS-02 — Response DTO:** Response `data` is a single `ComponentCollectionWithSubsystemsDto`:
- `spfModules`, `dataLinks`, `controlLinks` — components at the top (unparented) level only.
- `subsystems` — root subsystem nodes (QWS-08), each recursively populated via `children: ComponentCollectionWithSubsystemsDto`.

**QWS-03 — Request validation:** Empty or missing `systemIds` → `400 Bad Request` (same as `/query`, carried over from existing controller code).

**QWS-04 — Invalid usecase IDs — all-or-nothing:** If any requested usecase system ID does not exist in the project, the entire request fails (`404 Not Found` or `422 Unprocessable Entity`, consistent with existing error-code conventions elsewhere in the controller) — no partial/207 result. This is a deliberate divergence from `/query`'s 207 partial-success behavior.

#### B.4.2 Usecase scoping

**QWS-05 — Module scoping matches `/query`:** The set of in-scope modules for the requested usecase system IDs is determined the same way as `DbUseCaseQueryService.queryModulesForUseCases` today: usecase → `use_case_subgraphs` → `spf_modules.subgraph_system_id` → module nodes.

**QWS-06 — Link scoping matches `/query`:** In-scope data/control links are determined the same way as `DbUseCaseQueryService.queryDataLinksForUseCases` / `queryControlLinksForUseCases` today (via `INTRA_SUBGRAPH` and `INTRA_USECASE` link-type joins against `use_case_subgraphs` / `use_case_subgraph_pairs`).

**QWS-07 — Dedup across requested usecases:** If a module, subsystem, or link is reachable from more than one requested usecase system ID, it appears exactly once in the response, at the tree position determined by its actual parent chain.

#### B.4.3 Tree construction

**QWS-08 — Root discovery:** Given the in-scope module set (QWS-05), roots for the returned tree are found by walking each in-scope module's `parentId` chain upward to its top-level (parentless) ancestor. Every distinct top-level ancestor reached this way is a root subsystem candidate for QWS-09. If an in-scope module itself has no parent, it is placed directly in the top-level `spfModules` array (QWS-02), not wrapped in a synthetic subsystem.

**QWS-09 — Pruning:** A subsystem node (root or nested) appears in the response only if at least one in-scope module exists at or beneath it. A subsystem with no in-scope descendant (e.g. `SubsystemB` containing only out-of-scope modules) is omitted entirely, along with any of its own descendant subsystems.

**QWS-10 — Full-depth recursion:** Every subsystem included in the response (per QWS-09) has its `children` populated recursively to leaf — same as `subsystem-query-lld.md` FR-SSQ-06. There is no depth limit or lazy-loading.

**QWS-11 — Flat-graph fallback:** If no in-scope module has any subsystem ancestor, `subsystems` is an empty array and all in-scope components appear in the top-level flat arrays — behaviorally equivalent output to the existing flat `/query` endpoint's data, wrapped in `ComponentCollectionWithSubsystemsDto`.

**QWS-12 — Non-scoped siblings never leak in:** Modules or subsystems that are structurally beneath an included root but not themselves in-scope (and have no in-scope descendant) are excluded from that subsystem's `children`, even though the subsystem itself is included because a *different* branch is in-scope.

#### B.4.4 Link placement in the tree

**QWS-13 — Non-boundary-crossing links placed at the shared level:** A data/control link whose two endpoint modules share the same immediate parent is placed in that parent's (or the top level's) `dataLinks`/`controlLinks` array — same placement rule as `subsystem-query-lld.md` §2.6 (link belongs to the level where both endpoint ports' owning nodes are direct children).

**QWS-14 — Boundary-crossing links use precomputed segments:** A data/control link crossing one or more subsystem boundaries is represented using its precomputed `subsystem_data_links` / `subsystem_control_links` segment rows (one segment per boundary crossed), not the raw `data_links` / `control_links` row directly. Each segment is placed at the tree level matching its own two segment-endpoints, per QWS-13. Example: a link from module M2 (top level) to module Z inside subsystem SS1 is stored as two segments — M2→SS1 (placed at the top level, since M2 and the SS1 boundary-entry point are both top-level) and SS1→Z (placed inside SS1's own `children`, since the SS1 boundary-exit point and Z are both direct children of SS1).

**QWS-15 — Segment-to-real-link mapping preserved:** Each placed segment resolves back to its real `data_links` / `control_links` row (via `subsystem_data_links.data_link_system_id` / `subsystem_control_links.control_link_system_id`) for DTO field population (`isEc`, `linkType`, `heapId`, etc.) — the segment table supplies the placement (which two ports/nodes), the real link row supplies the link's own attributes.

#### B.4.5 Edit-session overlay

**QWS-16 — Overlay applied:** Applied to modules, links, and node/subsystem rows that participate in tree construction. Staged `CREATE`/`UPDATE`/`DELETE` edit actions are resolved before scoping (QWS-05/QWS-06) and tree assembly (QWS-08–QWS-14) run.

**QWS-17 — Only STAGED drafts visible:** Matching `subsystem-query-lld.md` FR-SH-04 and OQ-4 of `usecase-components-query-design.md`.

#### B.4.6 Out of scope for this endpoint (not addressed elsewhere)

**QWS-18 — `isDangling` unchanged:** Hardcoded to `false` in the response, matching current flat `/query` behavior.

**QWS-19 — `filteredKeys` included on subsystems:** Each included `SubsystemDto.filteredKeys` is populated from `subsystems.filteredKeys` (many-to-many to `key_definitions`), matching `subsystem-query-lld.md` FR-SSQ-07 — no usecase scoping applies to this field, it's a static property of the subsystem itself.

### B.5 Invariants

**QWS-I1 — Tree completeness:** Every in-scope module (QWS-05) and every in-scope link (QWS-06) appears exactly once in the response, either at the top level or nested inside exactly one subsystem's `children` at the correct depth.

**QWS-I2 — No orphaned subsystems:** A subsystem never appears in the response unless it contains (directly or transitively) at least one in-scope module.

**QWS-I3 — Overlay consistency with `/query`:** For the same usecase system IDs and the same active session, the union of all modules/links appearing anywhere in this endpoint's tree (top level + all `children` at every depth) equals the flat set returned by `/query` for those same usecase system IDs.

### B.6 Non-Functional Requirements

**QWS-NFR-01:** Tree assembly is performed in-memory from a bounded number of batch queries — no per-node recursive DB queries (same principle as `subsystem-query-lld.md` NFR-SS-01/02).

**QWS-NFR-02:** Response time is not expected to materially exceed the existing flat `/query` endpoint for the same usecase set, since the additional work is in-memory grouping, not additional DB round-trips proportional to tree depth.

### B.7 Out of Scope

- `data-link` / `control-link` component+port lookup endpoints — explicitly deferred to a later deep-dive.
- Subgraph-scoped component lookup — see §D. Note the scoping rule differs (§A.2).
- New `isDangling` semantics — explicitly deferred (QWS-18).
- Any change to how `subsystem_data_links`/`subsystem_control_links` segments are *created* — this endpoint only *reads* them.
- Pagination or partial-tree/lazy-loading — full tree is always returned (QWS-10).

### B.8 Open Questions

**QWS-OQ-1 — RESOLVED:** Root discovery (QWS-08) requires walking `parentId` chains upward from every in-scope module and de-duplicating top-level ancestors. Confirmed against the installed TypeORM package (see `../tree-traversal-decision.md`) that this cannot be delegated to TypeORM's tree-entity feature. Resolution: batch-load all nodes for the file in one query, build `parentId → children[]` and `systemId → node` maps in memory, then traverse — same pattern as `subsystem-query-lld.md`'s `buildSubsystem` recursion, extended with upward root discovery and in-scope pruning.

**QWS-OQ-2:** Exact HTTP status code for QWS-04 (all-or-nothing invalid-usecase-ID failure) — `404` (usecase not found) vs `422` (unprocessable) — needs to be settled in design, consistent with existing conventions elsewhere in `usecase.controller.ts` (e.g. `updateUsecase` uses 404 for not-found, 422 for failure).

**QWS-OQ-3:** Whether the `subsystemQueryService`/read-model split from the unimplemented `subsystem-query-lld.md` should be reused/extended for this endpoint, or whether this endpoint gets its own dedicated query service method on `UseCaseQueryService` — design decision, not a requirement.

---

## C. `GET /usecases/filtered-by-subsystem`

### C.1 What this builds on (endpoint-specific)

- `subsystems.filteredKeys` (many-to-many to `key_definitions` via the auto-generated `subsystem_filtered_keys_key_definition` join table) — each subsystem already declares which GKV keys it cares about.
- `usecase_gkv_values` (`UsecaseGkvValuesRow`) — each usecase's full raw GKV (all key-value pairs), via `use_cases.gkvEntries` → `value_definitions` → `key_definitions`.
- `UsecaseIdentifierDto`, `SubsystemFilteredKeyValuePairsInfo`, `SubsystemFilteredUsecasesDto` — DTOs already defined (`packages/api/src/presentation/rest/modules/usecase/dto/usecase.dto.ts`, `packages/api/src/presentation/rest/common/dto/kv.dto.ts`). No new DTOs are needed for the response shape.
- The existing `GET /usecases` endpoint's `filter` query param (`spfModuleInstanceId`/`subgraphId`/`containerId`) is a **different, already-implemented filter** on a different endpoint. This endpoint's `filter` param (`subsystemId` only) is exclusive to `filtered-by-subsystem` — the two filter grammars share syntax (AND/OR/parentheses) but not semantics or valid fields.

### C.2 Key decisions already made

- Grouping key is a **projection**: for a given subsystem, take that subsystem's own `filteredKeys`, then project every qualifying usecase's full GKV down to only the key-value pairs whose key is in that set. Usecases whose projected subset is identical are grouped into one `SubsystemFilteredUsecasesDto` entry (`filteredKv` + `usecases[]`, each usecase's `keyValueCollection` still showing its *full* raw GKV, not the projected subset — see FBS-09).
- Usecase-to-subsystem membership is **structural**, via the module parent chain: a usecase qualifies for subsystem SS if at least one module reachable from that usecase (via `use_case_subgraphs`) has SS anywhere in its `parentId` ancestor chain, at any depth (not just immediate parent).
- No explicit `filter` → every subsystem in the project file is processed.
- `subsystemId:X AND subsystemId:Y` → the usecase must qualify for **both** SS X and SS Y (span both), each still reported under its own separate `filteredKv` grouping — AND is not a merge of the two subsystems' filtered keys into one group.
- An unrecognized `subsystemId` in the filter fails the whole request (consistent with QWS-04's all-or-nothing choice for invalid usecase IDs).

### C.3 Definitions

| Term | Definition |
|------|------------|
| Filtered key set | The `key_definitions` rows linked to a subsystem via its `filteredKeys` many-to-many relation. |
| Projected GKV | A usecase's full GKV (`keyValueCollection`), reduced to only the key-value pairs whose key belongs to a subsystem's filtered key set. |
| Qualifying usecase (for subsystem SS) | A usecase with at least one module (reachable via `use_case_subgraphs` → `spf_modules.subgraph_system_id`) whose `nodes.parentId` ancestor chain includes SS, at any depth. |
| filteredKV group | One entry in the response: a distinct projected-GKV value, paired with every qualifying usecase that produces that same projected value for the subsystem being processed. |

### C.4 Functional Requirements

#### C.4.1 Request

**FBS-01 — Endpoint signature unchanged:** `GET /arc-api/v1/projects/{projectId}/usecases/filtered-by-subsystem?filter=<expression>`, matching the existing controller stub and swagger spec. `filter` is optional.

**FBS-02 — Filter grammar — `subsystemId` only:** The `filter` expression supports only the `subsystemId` field, combined with `AND`/`OR`/parentheses, matching the swagger description already in place. Any other field name in the filter → `400 Bad Request` (same validation posture as the existing `filter` param on `GET /usecases`, which restricts to its own field set).

**FBS-03 — No filter → all subsystems:** If `filter` is omitted, every subsystem in the project file is processed and included in the response (subject to FBS-08 — a subsystem with zero qualifying usecases produces no entry).

**FBS-04 — `AND` — usecase must span all named subsystems:** `subsystemId:X AND subsystemId:Y` restricts the usecases considered to only those qualifying (FBS-07) for **every** named subsystem. Each named subsystem is still reported as its own separate `filteredKv` group (FBS-09) — `AND` is a usecase-membership constraint, not a merge of filtered-key sets.

**FBS-05 — `OR` — union of named subsystems:** `subsystemId:X OR subsystemId:Y` processes both SS X and SS Y independently (each gets its own group(s)), equivalent to making two separate FBS-07 passes and unioning the results.

**FBS-06 — Unrecognized `subsystemId` fails the request:** If any `subsystemId` named in the filter does not correspond to a subsystem in the project file, the entire request fails (`404 Not Found` or `422 Unprocessable Entity`, consistent with QWS-04/QWS-OQ-2) — no partial result.

#### C.4.2 Usecase-to-subsystem membership

**FBS-07 — Structural qualification via module ancestor chain:** A usecase qualifies for subsystem SS if at least one module reachable from that usecase (via `use_case_subgraphs` → `spf_modules.subgraph_system_id`, same scoping as QWS-05) has SS anywhere in its `nodes.parentId` ancestor chain, walked to any depth — not only its immediate parent.

**FBS-08 — Subsystems with no qualifying usecase produce no entry:** If no usecase qualifies for a given subsystem (FBS-07), that subsystem contributes nothing to the response — no empty `SubsystemFilteredUsecasesDto` is emitted for it.

#### C.4.3 Grouping and projection

**FBS-09 — Projection onto filtered keys:** For each qualifying usecase (FBS-07) of a subsystem SS, project the usecase's full GKV down to only the key-value pairs whose key belongs to SS's `filteredKeys`. Usecases producing an identical projected key-value set are grouped into one `SubsystemFilteredUsecasesDto` entry: `filteredKv` holds the shared projected set, `usecases` holds every qualifying usecase with that projection (each usecase entry shows its own **full** raw GKV via `UsecaseIdentifierDto.keyValueCollection` — the projection is only the grouping key, not a truncation applied to the usecase entries themselves).

**FBS-10 — Multiple groups per subsystem:** A single subsystem can produce more than one `SubsystemFilteredUsecasesDto` entry in the response if its qualifying usecases don't all share the same projected key-value set — one entry per distinct projection.

**FBS-11 — Empty filtered-key set:** If a subsystem's `filteredKeys` is empty, every qualifying usecase for that subsystem projects to the same (empty) key-value set — they all collapse into a single group with an empty `filteredKv.keyValueCollection`.

#### C.4.4 Edit-session overlay

**FBS-12 — Overlay applied:** Applied to usecase GKV membership, module/node rows (for the parent-chain walk in FBS-07), and subsystem `filteredKeys` membership — staged `CREATE`/`UPDATE`/`DELETE` edit actions are resolved before qualification (FBS-07) and projection (FBS-09) run.

**FBS-13 — Only STAGED drafts visible:** Matching QWS-17 and SGC-09.

### C.5 Invariants

**FBS-I1 — Every usecase in the response actually qualifies:** No usecase appears under a subsystem's group unless FBS-07 holds for that usecase and that subsystem.

**FBS-I2 — Projection consistency:** Within one `filteredKv` group, every listed usecase's GKV, projected onto the group's subsystem's `filteredKeys`, equals exactly the group's `filteredKv.keyValueCollection`.

**FBS-I3 — No duplicate usecase within one subsystem's groups:** A given usecase appears in at most one `filteredKv` group per subsystem (it has exactly one projected value for that subsystem's filtered keys).

### C.6 Non-Functional Requirements

**FBS-NFR-01:** Ancestor-chain qualification (FBS-07) and subsystem tree walking are performed via the same in-memory batch-load-then-traverse approach as §B — see `../tree-traversal-decision.md`. No per-subsystem or per-usecase recursive DB queries.

### C.7 Out of Scope

- The unrelated `filter` grammar on `GET /usecases` (`spfModuleInstanceId`/`subgraphId`/`containerId`) — already implemented, untouched by this document.
- Any change to how `subsystems.filteredKeys` membership is authored — this endpoint only reads it.
- Pagination — full result set is always returned.

### C.8 Open Questions

**FBS-OQ-1:** Exact HTTP status code for FBS-06 (unrecognized `subsystemId`) — `400` (bad filter value) vs `404` (not found) vs `422` — needs to be settled in design, consistent with the swagger stub's existing `400 Bad Request: Invalid filter parameter` response and with QWS-OQ-2.

**FBS-OQ-2:** Whether qualification (FBS-07) and projection (FBS-09) should be computed via a new dedicated query-service method, or composed from the existing `UseCaseQueryService`/future `SubsystemQueryService` methods already speced for §B and §D — design decision, not a requirement.

---

## D. Get Subgraph Components (new — not yet in swagger)

**Working name:** "Get components for a subgraph". This is a **core-layer requirements subsection**: it defines the read model, scoping rules, and query-service contract. The REST route, HTTP verb, and request/response DTO wiring are an API-layer design decision made later (see `subgraph.controller.ts`'s existing `/subgraphs/{subgraphSystemId}/...` pattern for precedent), not fixed here.

### D.1 What this builds on (endpoint-specific)

- `data_links.source_subgraph_system_id` / `dest_subgraph_system_id`, `control_links.source_subgraph_system_id` / `dest_subgraph_system_id` — every link already knows the subgraph(s) its two endpoint modules belong to.
- `link_type` enum (`INTRA_SUBGRAPH`, `INTRA_USECASE`, `INTER_USECASE`) — `INTRA_SUBGRAPH` is defined as `sourceSubgraphSystemId = destSubgraphSystemId` (invariant I5, `docs/subsystem-links/2026-05-30-subsystem-links-requirements.md`). This is exactly the link population this endpoint needs.
- `use_case_subgraph_pairs` (`packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/usecase-data/use-case-subgraph-pair.schema.ts`) — records which subgraph-to-subgraph crossings exist per usecase for `INTRA_USECASE` links. Confirmed with stakeholder: this endpoint does **not** consult this table — cross-subgraph links are excluded outright, independent of usecase pairing (see SGC-04).

### D.2 Key decisions already made

- Response shape mirrors `UseCaseComponentsReadModel` / `ComponentCollectionDto`: flat `modules` / `dataLinks` / `controlLinks` — no subsystem hierarchy, no usecase context.
- Scope is **strictly intra-subgraph**. A link with one endpoint module in the requested subgraph and the other endpoint module in a different subgraph is excluded entirely, regardless of `link_type` or whether a `use_case_subgraph_pairs` row exists for it (per stakeholder: *"any intra link will be considered as a sg pair and when queried for sg1 it shouldn't be shown"*).
- No usecase filtering — this is a subgraph-scoped query, independent of which usecase(s) reference the subgraph.

### D.3 Definitions

| Term | Definition |
|------|------------|
| Subgraph | A row in `subgraphs`, identified by `systemId`. Owns zero or more modules via `spf_modules.subgraph_system_id`. |
| In-subgraph module | A module whose `subgraphSystemId` equals the requested subgraph's `systemId`. |
| In-subgraph link | A data/control link whose `linkType = INTRA_SUBGRAPH` and whose `sourceSubgraphSystemId = destSubgraphSystemId = ` the requested subgraph's `systemId`. |
| Cross-subgraph link | A data/control link whose two endpoint modules belong to different subgraphs (`linkType` is `INTRA_USECASE` or `INTER_USECASE`, or `sourceSubgraphSystemId ≠ destSubgraphSystemId`). Always excluded from this endpoint's response (SGC-04). |

### D.4 Functional Requirements

#### D.4.1 Scoping

**SGC-01 — Module scoping:** Given a subgraph system ID, in-subgraph modules are all `spf_modules` (via their `nodes` row) where `subgraphSystemId` equals the requested subgraph's `systemId`. This is a direct column match — no join through usecase or container tables.

**SGC-02 — Data link scoping:** In-subgraph data links are all `data_links` rows where `linkType = INTRA_SUBGRAPH` and `sourceSubgraphSystemId = destSubgraphSystemId = ` the requested subgraph's `systemId`. Equivalently: both the link's source and destination modules are in-subgraph modules (SGC-01).

**SGC-03 — Control link scoping:** Same rule as SGC-02, applied to `control_links`.

**SGC-04 — Cross-subgraph links excluded — no exception for usecase pairing:** A data/control link where the two endpoint modules belong to different subgraphs is never included in the response, even if a `use_case_subgraph_pairs` row exists connecting the two subgraphs for some usecase. This endpoint does not consult `use_case_subgraph_pairs` or any usecase context at all.

**SGC-05 — Non-existent subgraph:** If the requested subgraph system ID does not correspond to any `subgraphs` row in the project file, the query service returns a failure (`ENTITY_NOT_FOUND`) — this is a single-subgraph lookup, not a partial-success batch query (contrast with `/usecases/components/query`'s unknown-ID tolerance).

#### D.4.2 Response shape

**SGC-06 — Read model shape:** The query service returns a read model with the same three-array shape as `UseCaseComponentsReadModel`: in-subgraph modules (SGC-01), in-subgraph data links (SGC-02), in-subgraph control links (SGC-03). Reuses the existing `ModuleReadModel`, `DataLinkReadModel`, `ControlLinkReadModel` interfaces — no new read-model types needed for the component data itself.

**SGC-07 — No subsystem hierarchy:** This endpoint does not build a subsystem tree (unlike §B). If in-subgraph modules happen to sit under subsystem nodes, that nesting is not reflected — all in-subgraph modules are returned as a flat array, same as `/usecases/components/query`.

#### D.4.3 Edit-session overlay

**SGC-08 — Overlay applied:** Staged `CREATE`/`UPDATE`/`DELETE` edit actions on modules and links are resolved before subgraph scoping (SGC-01–SGC-03) is evaluated, so a module staged to move into or out of this subgraph (`spf_modules.subgraph_system_id` UPDATE) is reflected in the response.

**SGC-09 — Only STAGED drafts visible:** Matching QWS-17 and FBS-13.

### D.5 Invariants

**SGC-I1 — Every returned link is fully internal:** For every data/control link in the response, both endpoint modules are also present in the response's module array (SGC-01–SGC-04 together guarantee this).

**SGC-I2 — Subgraph ownership is exclusive:** A module belongs to exactly one subgraph at any point in time (baseline or overlaid) — `subgraphSystemId` is a single scalar FK, not a set. Consequently a module cannot be "in-subgraph" for two different requested subgraph IDs simultaneously.

### D.6 Non-Functional Requirements

**SGC-NFR-01:** Module and link scoping (SGC-01–SGC-03) are direct indexed-column lookups (`ix_spf_modules_subgraph_file_system`, `idx_data_links_src_sg_scope`, `idx_control_links_src_sg_scope` already exist) — no in-memory tree traversal is required for this endpoint, unlike §B.

### D.7 Out of Scope

- Cross-subgraph link visibility in any form — explicitly excluded (SGC-04), not deferred.
- Subsystem hierarchy within the subgraph's modules (SGC-07).
- Batch/multi-subgraph query in one call — this document scopes a single-subgraph lookup (SGC-05); a batch variant (mirroring `/subgraphs/query`'s `systemIds` pattern) is a possible future extension, not committed here.
- REST route, HTTP verb, request/response DTO — API-layer design decision, deferred (per §D preamble).
- Usecase-aware variants (e.g. "components in this subgraph for usecase X") — this is a pure subgraph-scoped query with no usecase parameter.

### D.8 Open Questions

**SGC-OQ-1:** Should this be a new method on the existing `SubgraphQueryService`/`UseCaseQueryService` port, or a new dedicated port? `SubgraphQueryService` doesn't exist as a formal port yet (per `subgraph.controller.ts`, subgraph reads currently go through `SubgraphsQuery`/`GetAllSubgraphsQuery` directly to `queryBus`) — design must decide where this method lives.

**SGC-OQ-2:** Whether the REST route should be `GET /subgraphs/{subgraphSystemId}/components` (single, path param, matching `/subgraphs/{id}/properties` and `/subgraphs/{id}/usecases` precedent already in `subgraph.controller.ts`) or a `POST /subgraphs/components/query` batch form (matching `/usecases/components/query`) — deferred to API-layer design.

---

*End of Document*
