<!--
  Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
  SPDX-License-Identifier: BSD-3-Clause
-->

# Property Write API Design

**Feature folder:** `docs/property-data/`
**Status:** Design approved

---

## Requirements

### Scope

New write (and two new read) endpoints for subgraph properties (FR#1–FR#7) and container properties (FR#8–FR#10, FR#11). FR#12 (single-module container ID change) is already handled by `PATCH /spf-modules/:id`. FR#13/FR#14 (UI cache properties) are out of scope.

### Frozen Functional Requirements

#### Subgraph property endpoints

| FR | Method | Path | Description |
|---|---|---|---|
| FR#1 | PATCH | `/subgraphs/:id/scenario` | Set scenario property (Audio/Voice). Triggers 4–7 step cascade. Response: mutation log |
| FR#2 | PATCH | `/subgraphs/:id/vsid` | Set VSID. Always propagates via BFS. Response includes all affected subgraph IDs |
| FR#3 | PATCH | `/subgraphs/:id/asoc` | Set ASoC property type (Stream / Device / None). Swaps Stream↔Device properties internally |
| FR#4 | PATCH | `/subgraphs/:id/name` | Set subgraph name. Body: `{ name: string }` |
| generic | PATCH | `/subgraphs/:id/properties/:propSystemId` | Low-cascading property update. Returns `400` if `propSystemId` maps to a reserved property (scenario, VSID, ASoC) |
| FR#11 | PATCH | `/subgraphs/:id/container-id` | Update container ID for all modules in the subgraph. May create new container |

#### VCPM CKV endpoints (under subgraph)

| FR | Method | Path | Description |
|---|---|---|---|
| GET-1 | GET | `/subgraphs/:id/vcpm-ckv` | All configured parameters and their associated CKVs for the subgraph |
| GET-2 | GET | `/subgraphs/:id/vcpm-ckv/:ckvSystemId/cal-data` | Cal data for a specific CKV. Optional `?param-system-ids=1,2` filter |
| FR#5 | POST | `/subgraphs/:id/vcpm-ckv` | Create a new CKV entry |
| FR#6 | DELETE | `/subgraphs/:id/vcpm-ckv/:ckvSystemId` | Delete a CKV entry |
| FR#7 | PUT | `/subgraphs/:id/vcpm-ckv/:ckvSystemId/cal-data` | Update cal payload for a CKV |

#### Container property endpoints

| FR | Method | Path | Description |
|---|---|---|---|
| FR#8/FR#9 | PATCH | `/containers/:id/properties/:propSystemId` | Generic container property update (includes parent container ID). Returns `400` if `propSystemId` maps to the capabilities property |
| FR#10 | PATCH | `/containers/:id/capabilities` | Set container capabilities. Validates all modules; returns error with incompatible module names |

#### Guard requirements

| ID | Description |
|---|---|
| FR#guard-subgraph | `PATCH /subgraphs/:id/properties/:propSystemId` SHALL return `400` when `propertyId` corresponds to scenario, VSID, or ASoC. Message names the correct dedicated endpoint |
| FR#guard-container | `PATCH /containers/:id/properties/:propSystemId` SHALL return `400` when `propertyId` corresponds to the capabilities property. Message names `PATCH /containers/:id/capabilities` |

Guards enforced in the command handler (application layer), not the controller.

### Request body format

All property payloads use `{ data: ParameterDto[] }` — structured elements matching the GET response shape. **Reuses the existing `UpdateSpfModuleCalDataRequestDto`** — no new request DTO needed for this shape.

---

## Response shapes

| Endpoint | Response DTO | New? |
|---|---|---|
| PATCH scenario | `UpdateScenarioResponseDto` | New — mutation log shape |
| PATCH vsid | `UpdateVsidResponseDto` | New — affected subgraph IDs |
| PATCH asoc | `UpdateAsocResponseDto` | New — updated property list |
| PATCH generic subgraph property | `PropertyResponseDto` | Reuse existing |
| PATCH subgraph name | `SubgraphPropertiesResponseDto` | Reuse existing (re-query) |
| PATCH subgraph container-id | 204 no body | — |
| PATCH generic container property | `PropertyResponseDto` | Reuse existing |
| PATCH container capabilities | `UpdateCapabilitiesResponseDto` | New — updated capabilities + any validation error |
| GET vcpm-ckv | `VcpmCkvResponseDto` | New — param + CKV list |
| GET vcpm-ckv cal-data | `CkvCalDataResponseDto` | Reuse existing (spf-module) |
| POST vcpm-ckv | `CreateVcpmCkvResponseDto` | New — created CKV entry |
| DELETE vcpm-ckv | 204 no body | — |
| PUT vcpm-ckv cal-data | `CkvCalDataResponseDto` | Reuse existing |

No `groupId` in any response.

---

## Architecture

### Patterns reused

CQRS via `QueryBus` (reads) and `CommandBus` (writes). Write pattern from `PatchSpfModuleCommand` / `PatchSpfModuleHandler`:

1. Controller calls `commandBus.execute<TResponse>(cmd, session)` — session via `@ArcSession()` + `@UseGuards(SessionGuard)`.
2. Simple mutations: handler returns `void`, controller re-queries for the updated entity.
3. Complex mutations (scenario, VSID, ASoC): handler returns the mutation result directly — controller maps to response DTO, no re-query needed.

Key artefacts to mirror:
- `PatchSpfModuleCommand` / `PatchSpfModuleHandler` — command + handler file layout, `BaseCommand` static fields
- `BaseCommand` (`packages/core/src/application/shared/base-command.ts`) — `requiresSession`, `allowedModes`
- `UpdateSpfModuleCalDataRequestDto` — reused as-is for all `{ data: ParameterDto[] }` request bodies
- `CkvCalDataResponseDto` — reused as-is for VCPM cal-data GET-2 and PUT FR#7
- `PropertyResponseDto` — reused for generic property PATCH responses
- `SubgraphPropertiesResponseDto` / `ContainerPropertiesResponseDto` — reused

### Design decisions

**Dedicated endpoints for high-cascading operations:** Each gets its own PATCH path with a distinct, strongly-typed response. The generic endpoint handles only low-cascade properties and actively rejects reserved property IDs (400).

**VSID always propagates:** The `overwrite=false` preview mode is removed. VSID PATCH always propagates via BFS. The response includes `affectedSubgraphSystemIds` so the caller sees what changed.

**Mutation log from handler:** Scenario cascade touches every module's CKVs. Re-querying all affected data would be expensive. Handlers accumulate mutations as they apply them and return a structured log. This is a design-time decision — handlers are stubs initially.

**Guard at handler level:** Reserved property IDs are domain constants. `InvalidOperationException` from the handler, same as all other domain rule violations.

---

## Component Design

### 1. Commands and handlers

All new commands are stubs — each handler throws `NotImplementedException`. Logic added in a later pass.

One folder per operation, mirroring `spf-module/patch/`.

#### Subgraph commands (`packages/core/src/application/usecase-designer/subgraph/`)

| Folder | Command | Handler | Returns |
|---|---|---|---|
| `set-scenario/` | `SetSubgraphScenarioCommand` | `SetSubgraphScenarioHandler` | `ScenarioChangeResult` |
| `set-vsid/` | `SetSubgraphVsidCommand` | `SetSubgraphVsidHandler` | `VsidUpdateResult` |
| `set-asoc/` | `SetSubgraphAsocCommand` | `SetSubgraphAsocHandler` | `AsocUpdateResult` |
| `set-name/` | `SetSubgraphNameCommand` | `SetSubgraphNameHandler` | `void` |
| `update-property/` | `UpdateSubgraphPropertyCommand` | `UpdateSubgraphPropertyHandler` | `void` |
| `update-container-id/` | `UpdateSubgraphContainerIdCommand` | `UpdateSubgraphContainerIdHandler` | `void` |
| `create-vcpm-ckv/` | `CreateVcpmCkvCommand` | `CreateVcpmCkvHandler` | `CreateVcpmCkvResult` |
| `delete-vcpm-ckv/` | `DeleteVcpmCkvCommand` | `DeleteVcpmCkvHandler` | `void` |
| `update-vcpm-cal-data/` | `UpdateVcpmCalDataCommand` | `UpdateVcpmCalDataHandler` | `void` |

#### Container commands (`packages/core/src/application/usecase-designer/container/`)

| Folder | Command | Handler | Returns |
|---|---|---|---|
| `update-property/` | `UpdateContainerPropertyCommand` | `UpdateContainerPropertyHandler` | `void` |
| `set-capabilities/` | `SetContainerCapabilitiesCommand` | `SetContainerCapabilitiesHandler` | `void` |

#### Query handlers (VCPM GETs)

Two new query handlers under `packages/core/src/application/usecase-designer/subgraph/`:

| Query | Returns |
|---|---|
| `GetVcpmCkvQuery` | `VcpmCkvDto` |
| `GetVcpmCalDataQuery` | `CkvCalDataDto` (reuses existing type) |

`GetVcpmCalDataQuery` mirrors `GetCkvCalibrationDataQuery` (spf-module): constructor `(projectId, subgraphSystemId, ckvSystemId, clientId, paramSystemIds?)`.

### 2. Core Zod schemas (new, in `@arc/core`)

All new response shapes get a Zod schema in `packages/core/src/` following the existing `z.object({...}).meta({id: '...'})` pattern. API layer extends via `createZodDto`.

| Schema | Shape |
|---|---|
| `ScenarioChangeDtoSchema` | `{ propertiesAdded: PropertyChange[], propertiesRemoved: PropertyChange[], moduleCkvsAdded: CkvRef[], moduleCkvsDeleted: CkvRef[] }` |
| `VsidUpdateDtoSchema` | `{ affectedSubgraphSystemIds: string[] }` |
| `AsocUpdateDtoSchema` | `{ updatedProperties: PropertyChange[] }` |
| `UpdateCapabilitiesDtoSchema` | `{ capabilities: number[] }` |
| `VcpmCkvDtoSchema` | `{ configuredParams: [{ paramSystemId: string, paramName: string, associatedCkvs: [{ ckvSystemId: string, ckv: [{keyId, valueId}] }] }] }` |
| `CreateVcpmCkvDtoSchema` | `{ ckvSystemId: string, ckv: [{ keyId: number, valueId: number }] }` |

Where `PropertyChange = { systemId: string, propertyId: number, propertyName: string }` and `CkvRef = { moduleSystemId: string, ckvSystemId: string }`.

### 3. API response DTOs (new)

| Class | Location | Extends |
|---|---|---|
| `UpdateScenarioResponseDto` | `modules/subgraph/dto/` | `createZodDto(ScenarioChangeDtoSchema)` |
| `UpdateVsidResponseDto` | `modules/subgraph/dto/` | `createZodDto(VsidUpdateDtoSchema)` |
| `UpdateAsocResponseDto` | `modules/subgraph/dto/` | `createZodDto(AsocUpdateDtoSchema)` |
| `UpdateCapabilitiesResponseDto` | `modules/container/dto/` | `createZodDto(UpdateCapabilitiesDtoSchema)` |
| `VcpmCkvResponseDto` | `modules/subgraph/dto/` | `createZodDto(VcpmCkvDtoSchema)` |
| `CreateVcpmCkvResponseDto` | `modules/subgraph/dto/` | `createZodDto(CreateVcpmCkvDtoSchema)` |

### 4. API request DTOs (new)

| Class | Body | Used by |
|---|---|---|
| `SetSubgraphScenarioRequestDto` | `{ scenarioType: 'AUDIO' \| 'VOICE' }` | PATCH scenario |
| `SetSubgraphVsidRequestDto` | `{ vsid: number }` | PATCH vsid |
| `SetSubgraphAsocRequestDto` | `{ asocType: 'STREAM' \| 'DEVICE' \| 'NONE' }` | PATCH asoc |
| `SetSubgraphNameRequestDto` | `{ name: string }` | PATCH name |
| `UpdateSubgraphContainerIdRequestDto` | `{ newContainerSystemId: string }` | PATCH container-id |
| `SetContainerCapabilitiesRequestDto` | `{ capabilities: number[] }` | PATCH capabilities |
| `CreateVcpmCkvRequestDto` | `{ ckv: { keyId: number; valueId: number }[] }` | POST vcpm-ckv |

`UpdateSpfModuleCalDataRequestDto` (already exists) is **reused** for all `{ data: ParameterDto[] }` request bodies — generic subgraph PATCH, generic container PATCH, and PUT vcpm cal-data.

### 5. Controller changes

#### `SubgraphController`

Add `CommandBus` as second constructor argument. New methods all use `@UseGuards(SessionGuard)` and `@ArcSession() session` for write endpoints:

```
PATCH /:subgraphSystemId/scenario                               → SetSubgraphScenarioCommand   → UpdateScenarioResponseDto
PATCH /:subgraphSystemId/vsid                                   → SetSubgraphVsidCommand        → UpdateVsidResponseDto
PATCH /:subgraphSystemId/asoc                                   → SetSubgraphAsocCommand        → UpdateAsocResponseDto
PATCH /:subgraphSystemId/name                                   → SetSubgraphNameCommand (void) → re-query → SubgraphPropertiesResponseDto
PATCH /:subgraphSystemId/properties/:propSystemId               → UpdateSubgraphPropertyCommand (void) → re-query → PropertyResponseDto
PATCH /:subgraphSystemId/container-id                           → UpdateSubgraphContainerIdCommand (void) → 204
GET   /:subgraphSystemId/vcpm-ckv                               → GetVcpmCkvQuery               → VcpmCkvResponseDto
GET   /:subgraphSystemId/vcpm-ckv/:ckvSystemId/cal-data         → GetVcpmCalDataQuery            → CkvCalDataResponseDto
POST  /:subgraphSystemId/vcpm-ckv                               → CreateVcpmCkvCommand          → CreateVcpmCkvResponseDto
DELETE/:subgraphSystemId/vcpm-ckv/:ckvSystemId                  → DeleteVcpmCkvCommand (void)   → 204
PUT   /:subgraphSystemId/vcpm-ckv/:ckvSystemId/cal-data         → UpdateVcpmCalDataCommand (void) → re-query → CkvCalDataResponseDto
```

#### `ContainerController`

Add `CommandBus` as second constructor argument:

```
PATCH /:containerSystemId/properties/:propSystemId  → UpdateContainerPropertyCommand (void) → re-query → PropertyResponseDto
PATCH /:containerSystemId/capabilities              → SetContainerCapabilitiesCommand (void) → re-query → UpdateCapabilitiesResponseDto
```

---

## Error handling

| Scenario | Status | Notes |
|---|---|---|
| Subgraph / container not found | 404 | `ResourceNotFoundException` |
| Generic property is a reserved type | 400 | `InvalidOperationException`; message names the dedicated endpoint |
| Capabilities validation failure | 422 | `DomainRuleViolationException`; body includes incompatible module names |
| Container ID capability/domain mismatch | 422 | |
| Property not found on entity | 404 | |
| No session present | 401 | Via `SessionGuard` / `SessionRequiredError` |

---

## Cascade summary (for implementers)

| Operation | Cascade level | Key side effects |
|---|---|---|
| Scenario Audio→Voice | HIGH | Adds VCPM defs, BFS-finds optimal VSID, swaps audio/voice properties, **wipes ALL module CKVs**, restores zero defaults, adds VCPM cfg data |
| Scenario Voice→Audio | HIGH | Wipes all module CKVs, swaps voice/audio properties, removes all VCPM cfg data |
| VSID propagation | HIGH | BFS across GKVs, may update multiple subgraphs |
| ASoC swap | MEDIUM | Removes one property type, adds the other |
| Container capabilities | MEDIUM | Validates all modules before write |
| Container ID (subgraph scope) | HIGH | Bulk-updates all modules; may create new container |
| Generic subgraph/container property | LOW | Direct set, no cascade |
| VCPM CKV create / delete / update | LOW | Single-entry operations |

---

## Verification

1. **Unit tests** — one stub test file per command handler; expand when logic is added.
2. **Integration tests** (add when handlers are implemented):
   - `PATCH /scenario`: verify CKV wipe on Audio→Voice; CKV restore on Voice→Audio; mutation log matches.
   - `PATCH /vsid`: verify BFS-connected subgraphs updated; `affectedSubgraphSystemIds` populated.
   - `PATCH /containers/:id/capabilities`: verify validation rejects incompatible modules.
   - `PATCH /subgraphs/:id/properties/:propSystemId` with a scenario property ID: verify 400.
3. **Swagger**: run `npm run swagger:generate` (or equivalent); confirm new endpoints appear under `subgraphs` and `containers` tags.
