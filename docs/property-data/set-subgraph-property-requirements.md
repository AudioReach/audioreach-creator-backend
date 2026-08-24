<!--
  Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
  SPDX-License-Identifier: BSD-3-Clause
-->

# Requirements: Subgraph Property Write API

**Feature folder:** `docs/property-data/`
**Status:** DRAFT
**Date:** 2026-08-24
**Reference:** `docs/property-data/design/property-write-api-design.md`

---

## Context

Write endpoints for managing subgraph properties in the AudioReach usecase designer. Subgraph properties fall into two categories:

- **Simple properties** — direct writes with no cascade (name, generic SPF/driver properties).
- **Cascading properties** — writes that trigger side effects across the subgraph or across linked subgraphs (scenario, VSID, subgraph type, ASoC).

All writes are staged and not applied to the canonical data until the caller invokes commit.

---

## Definitions

| Term | Meaning |
|---|---|
| SubgraphPropertyData | One row per property per subgraph. |
| PropertyDefinition | Defines a property — its name, valid values, and element structure. |
| SPF property | A gecko/SPF-layer subgraph config property (PROPERTY_TYPE.Spf). |
| Driver property | A GSL/driver-layer subgraph property (PROPERTY_TYPE.Driver). |
| Scenario | SPF property `SUB_GRAPH_PROP_ID_SCENARIO_ID` — determines if the subgraph is Audio or Voice. |
| VSID | SPF property `SUB_GRAPH_PROP_ID_VSID` — Voice Session ID; shared across voice subgraphs linked by the same GKV. |
| Subgraph Type | Driver property `SUBGRAPH_TYPE_DRIVER_PROP_ID` — determines if the subgraph is Stream, Device, or None. |
| ASoC | Driver properties for ASoC topology. Either Stream (`ASoC_STREAM_PROPERTY`) or Device (`ASoC_DEVICE_PROPERTY`) — mutually exclusive. Set automatically with default data when subgraph type is changed; updated directly via the ASoC endpoint. |
| Staged write | A pending change visible via overlay read but not yet committed to the canonical table. |

---

## FR-SG-NAME — PATCH /subgraphs/:id/name

### FR-SG-NAME-01 — Endpoint definition

`PATCH /arc-api/v1/projects/:projectId/subgraphs/:subgraphSystemId/name`

Request body:

```json
{ "name": "string" }
```

An empty string is a valid value and clears the name.

### FR-SG-NAME-02 — Subgraph existence

`subgraphSystemId` must refer to a non-deleted subgraph in the session's file. → `404` if not found.

### FR-SG-NAME-03 — Staged write

The name update must be staged. Visible immediately via overlay read before commit.

### FR-SG-NAME-04 — Response

Handler returns `{ groupId: string }`. Controller re-queries via `GetSubgraphPropertiesQuery`
and returns `SubgraphPropertiesResponseDto`. → `200`.

---

## FR-SG-PROP — PATCH /subgraphs/:id/properties/:propSystemId

### FR-SG-PROP-01 — Endpoint definition

`PATCH /arc-api/v1/projects/:projectId/subgraphs/:subgraphSystemId/properties/:propertySystemId`

Request body:

```json
{
  "elements": ParameterElementSummaryDto[]
}
```

Example for a simple SPF property:

```json
{
  "elements": [
    {
      "type": "ConfigElement",
      "name": "direction",
      "value": "1"
    }
  ]
}
```

### FR-SG-PROP-02 — Subgraph existence

`subgraphSystemId` must refer to a non-deleted subgraph in the session's file. → `404` if not found.

### FR-SG-PROP-03 — Property definition existence

`propertySystemId` must refer to a property definition in the session's file. → `404` if not found.

### FR-SG-PROP-04 — Reserved property guard

If `propertySystemId` maps to any of the following reserved properties, the request must be
rejected → `400` with a message naming the correct dedicated endpoint:

| Property | Dedicated endpoint |
|---|---|
| Scenario (`SUB_GRAPH_PROP_ID_SCENARIO_ID`) | `PATCH /subgraphs/:id/scenario` |
| VSID (`SUB_GRAPH_PROP_ID_VSID`) | `PATCH /subgraphs/:id/vsid` |
| ASoC Stream (`ASoC_STREAM_PROPERTY`) | `PATCH /subgraphs/:id/asoc` |
| ASoC Device (`ASoC_DEVICE_PROPERTY`) | `PATCH /subgraphs/:id/asoc` |
| Subgraph Type (`SUBGRAPH_TYPE_DRIVER_PROP_ID`) | `PATCH /subgraphs/:id/sgtype` |

Guard is enforced in the command handler, not the controller.

### FR-SG-PROP-05 — Staged write

The property update must be staged. Visible immediately via overlay read before commit.

### FR-SG-PROP-06 — Response

Handler returns `{ groupId: string }`. Controller re-queries via `GetSubgraphPropertiesQuery`
and returns `PropertyResponseDto` for the single updated property. → `200`.

---

## FR-SG-SCENARIO — PATCH /subgraphs/:id/scenario

### FR-SG-SCENARIO-01 — Endpoint definition

`PATCH /arc-api/v1/projects/:projectId/subgraphs/:subgraphSystemId/scenario`

Request body uses the same elements format as the generic property endpoint:

```json
{
  "elements": [
    {
      "type": "ConfigElement",
      "name": "scenario_id",
      "value": "3"
    }
  ]
}
```

Where `value` is the uint32 scenario ID as a string. The handler resolves the scenario
type (Audio vs Voice) internally from the value and determines whether a cascade is needed.

### FR-SG-SCENARIO-02 — Subgraph existence

`subgraphSystemId` must refer to a non-deleted subgraph in the session's file. → `404` if not found.

### FR-SG-SCENARIO-03 — No-op on same scenario

If the subgraph's current scenario already matches the requested value, the handler
returns immediately with no writes. → `200` with an empty mutation log.

### FR-SG-SCENARIO-04 — Audio → Voice cascade

When the current scenario is Audio and the requested scenario is Voice, the following steps
are applied in order. All steps are atomic — either all succeed or none are applied:

1. **Add VCPM module definitions** — ensure VCPM module definitions are present in the session.
2. **Find optimal VSID** — BFS across all GKVs linked to this subgraph to find a consistent
   VSID from other voice subgraphs in the same usecases. If none found, use the property
   definition's default. If conflicting VSIDs are found across usecases, the request is
   rejected → `422` with a message describing the conflict.
3. **Add voice-specific SPF properties** — for each property definition where `IsVoice = true`,
   add the property with its default payload.
4. **Remove audio-specific SPF properties** — remove the clock scale factor property
   (`SUB_GRAPH_PROP_CLOCK_SCALE_FACTOR`) if present.
5. **Set VSID** — write the optimal VSID found in step 2.
6. **Wipe all module CKV/TKV cal data** — for every non-deleted module in the subgraph:
   - Remove all configured (non-zero) CKV cal data.
   - Remove all TKV cal data.
   - Remove all tagged module entries.
   - Restore zero-CKV default cal data for each calibration parameter.
7. **Add default VCPM cfg data** — for each VCPM cfg parameter definition, add a zero-CKV
   entry with its default payload.
8. **Update scenario property** — write the new scenario ID.

### FR-SG-SCENARIO-05 — Voice → Audio cascade

When the current scenario is Voice and the requested scenario is Audio, the following steps
are applied in order. All steps are atomic:

1. **Wipe all module CKV/TKV cal data** — same as FR-SG-SCENARIO-04 step 6.
2. **Remove voice-specific SPF properties** — remove all properties where `IsVoice = true`.
3. **Add audio-specific SPF properties** — add the clock scale factor property
   (`SUB_GRAPH_PROP_CLOCK_SCALE_FACTOR`) with its default payload.
4. **Remove all VCPM cfg data** — remove all VCPM CKV entries and their parameter payloads.
5. **Update scenario property** — write the new scenario ID.

### FR-SG-SCENARIO-06 — Response

Handler returns `{ groupId: string }` plus a structured mutation log. Controller maps
directly to `UpdateScenarioResponseDto` — no re-query needed.

```json
{
  "groupId": "string",
  "propertiesAdded": [{ "systemId": "string", "propertyId": 0, "propertyName": "string" }],
  "propertiesRemoved": [{ "systemId": "string", "propertyId": 0, "propertyName": "string" }],
  "moduleCkvsAdded": [{ "moduleSystemId": "string", "ckvSystemId": "string" }],
  "moduleCkvsDeleted": [{ "moduleSystemId": "string", "ckvSystemId": "string" }]
}
```

→ `200`.

---

## FR-SG-VSID — PATCH /subgraphs/:id/vsid

### FR-SG-VSID-01 — Endpoint definition

`PATCH /arc-api/v1/projects/:projectId/subgraphs/:subgraphSystemId/vsid`

Request body uses the same elements format as the generic property endpoint:

```json
{
  "elements": [
    {
      "type": "ConfigElement",
      "name": "vsid",
      "value": "196609"
    }
  ]
}
```

Where `value` is the uint32 VSID as a string.

### FR-SG-VSID-02 — Subgraph existence

`subgraphSystemId` must refer to a non-deleted subgraph in the session's file. → `404` if not found.

### FR-SG-VSID-03 — No-op on same value

If the subgraph's current VSID already matches the incoming value, the handler returns
immediately with no writes. → `200` with an empty `affectedSubgraphSystemIds` list.

### FR-SG-VSID-04 — BFS propagation

VSID always propagates. The handler performs a BFS across all GKVs linked to the subgraph
to find all other voice subgraphs in the same usecases. The new VSID is written to the
target subgraph and all BFS-discovered subgraphs as one atomic operation. Zero-GKV
usecases are skipped.

### FR-SG-VSID-05 — Staged write

All VSID writes are staged as one atomic operation sharing the same `groupId`. Visible
immediately via overlay read before commit.

### FR-SG-VSID-06 — Response

Handler returns `{ groupId: string }` plus the list of all affected subgraph system IDs.
Controller maps directly to `UpdateVsidResponseDto` — no re-query needed.

```json
{
  "groupId": "string",
  "affectedSubgraphSystemIds": ["string"]
}
```

→ `200`.

---

## FR-SG-SGTYPE — PATCH /subgraphs/:id/sgtype

### FR-SG-SGTYPE-01 — Endpoint definition

`PATCH /arc-api/v1/projects/:projectId/subgraphs/:subgraphSystemId/sgtype`

Request body uses the same elements format as the generic property endpoint:

```json
{
  "elements": [
    {
      "type": "ConfigElement",
      "name": "sg_type",
      "value": "2"
    }
  ]
}
```

### FR-SG-SGTYPE-02 — Subgraph existence

`subgraphSystemId` must refer to a non-deleted subgraph in the session's file. → `404` if not found.

### FR-SG-SGTYPE-03 — No-op on same value

If the subgraph's current type already matches the incoming value, the handler returns
immediately with no writes. → `200` with an empty `updatedProperties` list.

### FR-SG-SGTYPE-04 — Device cascade

When the new type resolves to `DEVICE`:
1. Write the new subgraph type property value.
2. Remove `ASoC_STREAM_PROPERTY` from the subgraph if present.
3. Add `ASoC_DEVICE_PROPERTY` with its **default payload fetched from the property
   definition in the DB**.

### FR-SG-SGTYPE-05 — Stream cascade

When the new type resolves to `STREAM`:
1. Write the new subgraph type property value.
2. Remove `ASoC_DEVICE_PROPERTY` from the subgraph if present.
3. Add `ASoC_STREAM_PROPERTY` with its **default payload fetched from the property
   definition in the DB**.

### FR-SG-SGTYPE-06 — None cascade

When the new type resolves to `NONE`:
1. Write the new subgraph type property value.
2. Remove `ASoC_STREAM_PROPERTY` from the subgraph if present.
3. Remove `ASoC_DEVICE_PROPERTY` from the subgraph if present.

### FR-SG-SGTYPE-07 — Staged write

The subgraph type write and all cascaded ASoC property adds/removes are staged as one
atomic operation sharing the same `groupId`. Visible immediately via overlay read before commit.

### FR-SG-SGTYPE-08 — Response

Handler returns `{ groupId: string }` plus the list of updated properties. Controller
maps directly to `UpdateSgtypeResponseDto` — no re-query needed.

```json
{
  "groupId": "string",
  "updatedProperties": [
    { "systemId": "string", "propertyId": 0, "propertyName": "string" }
  ]
}
```

→ `200`.

---

## FR-SG-ASOC — PATCH /subgraphs/:id/asoc

### FR-SG-ASOC-01 — Endpoint definition

`PATCH /arc-api/v1/projects/:projectId/subgraphs/:subgraphSystemId/asoc`

Request body uses the same elements format as the generic property endpoint. The handler
infers which ASoC property (Stream or Device) to update from the subgraph's current type.

Example for a Device subgraph:

```json
{
  "elements": [
    {
      "type": "ConfigElement",
      "name": "device_dai",
      "value": "105"
    }
  ]
}
```

Example for a Stream subgraph:

```json
{
  "elements": [
    {
      "type": "ConfigElement",
      "name": "streamId",
      "value": "Multimedia"
    },
    {
      "type": "ConfigElement",
      "name": "default_sg_pcm_format",
      "value": "1"
    },
    {
      "type": "ConfigElement",
      "name": "rate_min",
      "value": "48000"
    },
    {
      "type": "ConfigElement",
      "name": "rate_max",
      "value": "48000"
    },
    {
      "type": "ConfigElement",
      "name": "channel_min",
      "value": "1"
    },
    {
      "type": "ConfigElement",
      "name": "channel_max",
      "value": "1"
    }
  ]
}
```

### FR-SG-ASOC-02 — Subgraph existence

`subgraphSystemId` must refer to a non-deleted subgraph in the session's file. → `404` if not found.

### FR-SG-ASOC-03 — No ASoC property present

If the subgraph's current type is `NONE` — meaning no ASoC property is present — the
request is rejected → `422` with message:

```
No ASoC property present on this subgraph. Set subgraph type first
via PATCH /subgraphs/:id/sgtype.
```

### FR-SG-ASOC-04 — Write

The incoming `elements` are written to the ASoC property (Stream or Device) determined
by the subgraph's current type. No cascade — this is a direct property update.

### FR-SG-ASOC-05 — Staged write

The update is staged. Visible immediately via overlay read before commit.

### FR-SG-ASOC-06 — Response

Handler returns `{ groupId: string }`. Controller re-queries via
`GetSubgraphPropertiesQuery` and returns `PropertyResponseDto` for the updated
property. → `200`.

---

## Cross-Cutting Requirements

### FR-CCR-01 — Edit session required

All write endpoints require an active edit session for the project. → `403` if no session
is open.

### FR-CCR-02 — Session mode

All write endpoints are allowed in `DESIGNER` and `DIFF_MERGE` session modes only. → `403`
if the session mode is `TUNING` or `DISCOVERY_WIZARD`.

### FR-CCR-03 — Staging model

All writes are staged. Changes are not committed to the canonical tables until the caller
invokes `PATCH /projects/:projectId/commit`.

### FR-CCR-04 — Session overlay for reads

Staged (uncommitted) writes must be reflected in responses immediately after the write.

### FR-CCR-05 — groupId in all responses

Every write endpoint returns a `groupId` in its response. The `groupId` is the atomic
handle for the API call — all `edit_actions` rows produced within the call share the same
`groupId`. The client uses this for undo/redo and stage/unstage operations.

### FR-CCR-06 — Reserved property guard

`PATCH /subgraphs/:id/properties/:propSystemId` must reject requests where
`propertySystemId` maps to a reserved property (scenario, VSID, ASoC Stream, ASoC Device,
subgraph type). Guard is enforced in the command handler, not the controller. →
`400` with a message naming the correct dedicated endpoint.

---

## Invariants

| # | Invariant |
|---|---|
| I1 | A property written multiple times in the same session results in only one effective value — the latest write wins. |
| I2 | Scenario cascade and the triggering scenario property write are atomic — either all steps succeed or none are applied. |
| I3 | VSID propagation and all BFS-discovered subgraph writes are atomic — either all subgraphs are updated or none are. |
| I4 | Subgraph type write and its ASoC cascade (add/remove) are atomic — either all succeed or none are applied. |
| I5 | The generic property endpoint cannot write reserved property IDs — scenario, VSID, ASoC Stream, ASoC Device, and subgraph type always go through their dedicated endpoints. |
| I6 | ASoC property elements cannot be updated when subgraph type is NONE — the subgraph type must be set first via `PATCH /subgraphs/:id/sgtype`. |

---

## Error Codes Summary

| Scenario | HTTP Code |
|---|---|
| Subgraph not found | 404 |
| Property definition not found | 404 |
| No active session | 403 |
| Session mode not allowed | 403 |
| Generic property write targeting a reserved property ID | 400 |
| VSID conflict across linked usecases | 422 |
| Scenario VSID conflict during Audio → Voice cascade | 422 |
| ASoC update when subgraph type is NONE | 422 |

---

## Out of Scope

- **UI cache properties** (`AddUpdateSubGraphUiCacheProperty`, `RemoveSubGraphUiCacheProperty`) — no write endpoints needed.
- **VCPM CKV endpoints** — covered separately in the design doc (FR#5–FR#7).
- **Container ID change** — handled by `PATCH /subgraphs/:id/container-id`.
- **Subgraph export / import** — separate workflow.
- **VMID get / set / reset** — separate workflow.
- **Commit / undo / redo** — session lifecycle handled by the modification framework.
