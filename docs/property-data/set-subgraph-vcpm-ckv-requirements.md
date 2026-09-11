<!--
  Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
  SPDX-License-Identifier: BSD-3-Clause
-->

# Requirements: Subgraph VCPM CKV Write API

**Feature folder:** `docs/property-data/`
**Status:** DRAFT
**Date:** 2026-08-28
**Reference:** `docs/property-data/design/set-subgraph-vcpm-ckv-design.md`

---

## Context

Write endpoints for managing VCPM (Voice Call Processing Module) calibration key vectors on a subgraph. VCPM data is only present on Voice subgraphs (scenario = Voice Call). A VCPM CKV represents a calibration bin — a specific combination of key-value pairs that identifies a calibration scenario (e.g. speaker type + sample rate). Each CKV holds one parameter payload per VCPM parameter definition.

All writes are staged and not applied to the canonical data until the caller invokes commit.

---

## Definitions

| Term | Meaning |
|---|---|
| VcpmInstance | Links a subgraph to a VCPM module definition. One per subgraph (exactly one VCPM definition per file). |
| VcpmCkv | A calibration key vector — one row per calibration bin per VcpmInstance. Identified by its set of key-value pairs. |
| VcpmCkvValues | The key-value pair entries that identify a VcpmCkv. Composite PK — not individually staged. |
| VcpmParameterPayload | The binary calibration data for one parameter under a specific VcpmCkv. |
| Zero-CKV | A VcpmCkv with no key-value entries — the default calibration bin, always present. |
| Staged write | A pending change visible via overlay read but not yet committed to the canonical table. |

---

## FR-VCPM-POST — POST /subgraphs/:id/vcpm-ckv

### FR-VCPM-POST-01 — Endpoint definition

`POST /arc-api/v1/projects/:projectId/subgraphs/:subgraphSystemId/vcpm-ckv`

Request body:

```json
{
  "ckv": [
    { "valueSystemIds": ["string", "string"] }
  ]
}
```

Each entry in `ckv` represents one key dimension. `valueSystemIds` are `ValueDefinition.systemId` values identifying the key-value combination for this calibration bin.

### FR-VCPM-POST-02 — Subgraph existence

`subgraphSystemId` must refer to a non-deleted subgraph in the session's file. → `404` if not found.

### FR-VCPM-POST-03 — VcpmInstance existence

The subgraph must have an active `VcpmInstance` (i.e. it must be a Voice subgraph with VCPM data initialised). → `404` if no VcpmInstance exists.

### FR-VCPM-POST-04 — Duplicate CKV guard

If a `VcpmCkv` with exactly the same `valueSystemIds` combination already exists under the subgraph's VcpmInstance, the request must be rejected → `422`.

### FR-VCPM-POST-05 — Staged write

The new `VcpmCkv`, its `VcpmCkvValues`, and its `VcpmParameterPayload` rows must be staged. Visible immediately via overlay read before commit.

### FR-VCPM-POST-06 — Default payloads

For every parameter in the VCPM module definition, a `VcpmParameterPayload` row is created with the default payload derived from the parameter's `elementsStructure` (using the `defaultValue` field of each config element).

### FR-VCPM-POST-07 — Response

Handler returns `CreateVcpmCkvDto` directly — no re-query needed.

```json
{
  "groupId": "string",
  "ckvSystemId": "string",
  "ckv": [{ "keyId": 0, "valueId": 0 }]
}
```

`keyId` and `valueId` are the natural key IDs resolved from `ValueDefinition`. → `200`.

---

## FR-VCPM-DELETE — DELETE /subgraphs/:id/vcpm-ckv/:ckvSystemId

### FR-VCPM-DELETE-01 — Endpoint definition

`DELETE /arc-api/v1/projects/:projectId/subgraphs/:subgraphSystemId/vcpm-ckv/:ckvSystemId`

No request body.

### FR-VCPM-DELETE-02 — Subgraph existence

`subgraphSystemId` must refer to a non-deleted subgraph in the session's file. → `404` if not found.

### FR-VCPM-DELETE-03 — CKV existence

`ckvSystemId` must refer to a `VcpmCkv` belonging to this subgraph's VcpmInstance — in the committed state or staged as CREATE in the current session. → `404` if not found or already staged for DELETE.

### FR-VCPM-DELETE-04 — Staged write

The DELETE must be staged for the `VcpmCkv` and all its `VcpmParameterPayload` rows. `VcpmCkvValues` are handled via DB cascade when the `VcpmCkv` is committed. Visible immediately via overlay read before commit.

### FR-VCPM-DELETE-05 — Response

`void` → `204`.

---

## FR-VCPM-PUT — PUT /subgraphs/:id/vcpm-ckv/:ckvSystemId/cal-data

### FR-VCPM-PUT-01 — Endpoint definition

`PUT /arc-api/v1/projects/:projectId/subgraphs/:subgraphSystemId/vcpm-ckv/:ckvSystemId/cal-data`

Request body:

```json
{
  "parameters": [
    {
      "systemId": "string",
      "elements": [
        {
          "type": "ConfigElement",
          "name": "gain",
          "value": "100"
        }
      ]
    }
  ]
}
```

The client submits one entry per parameter to update. `systemId` is the `VcpmParameterPayload.systemId` obtained from the GET cal-data response. With one VCPM parameter today — one entry in the array. With multiple parameters in future — multiple entries, same endpoint.

### FR-VCPM-PUT-02 — Subgraph existence

`subgraphSystemId` must refer to a non-deleted subgraph in the session's file. → `404` if not found.

### FR-VCPM-PUT-03 — CKV existence

`ckvSystemId` must refer to a `VcpmCkv` belonging to this subgraph's VcpmInstance — overlay-aware (includes same-session CREATEs). → `404` if not found.

### FR-VCPM-PUT-04 — Update-only

This endpoint only updates existing `VcpmParameterPayload` rows — it does not create new ones. If a submitted parameter has no existing payload row in the effective state (committed or staged CREATE), it is treated as a per-parameter failure.

### FR-VCPM-PUT-05 — Per-parameter failures

The following are per-parameter failures — other parameters in the same request may still succeed:

| Condition | Failure reason |
|---|---|
| No existing `VcpmParameterPayload` row | Update-only — no new rows |
| Parameter definition has `isReadOnly = true` | Read-only parameter |
| Serialization of elements fails | Invalid element data |

### FR-VCPM-PUT-06 — Staged write

Successfully serialized payloads are staged as delta writes on `VcpmParameterPayload` rows. Visible immediately via overlay read before commit.

### FR-VCPM-PUT-07 — Response

Handler returns `PutVcpmCalDataResult { groupId, succeededParamSystemIds }`. Controller re-queries via `GetVcpmCalDataQuery` (filtered to succeeded params) and returns `CkvCalDataResponseDto`.

- All parameters succeeded → `200`, `data` present, `issues` empty.
- Some parameters failed → `207`, `data` present (succeeded only), `issues` non-empty.
- All parameters failed → `207`, `data` omitted, `issues` non-empty.

---

## Cross-Cutting Requirements

### FR-CCR-01 — Edit session required

All write endpoints require an active edit session for the project. → `403` if no session is open.

### FR-CCR-02 — Session mode

All write endpoints are allowed in `DESIGNER` and `DIFF_MERGE` session modes only. → `403` if the session mode is `TUNING` or `DISCOVERY_WIZARD`.

### FR-CCR-03 — Staging model

All writes are staged. Changes are not committed to the canonical tables until the caller invokes `PATCH /projects/:projectId/commit`.

### FR-CCR-04 — Session overlay for reads

Staged (uncommitted) writes must be reflected in responses immediately after the write — including same-session POST then PUT on the same CKV.

### FR-CCR-05 — groupId in all responses

Every write endpoint returns a `groupId` in its response. All `edit_actions` rows produced within the call share the same `groupId`. The client uses this for undo/redo.

---

## Invariants

| # | Invariant |
|---|---|
| I1 | A `VcpmCkv` with a duplicate key-value combination cannot be created — the POST guard rejects it. |
| I2 | A `VcpmCkv` creation (CKV row + parameter payloads) is atomic — either all succeed or none are applied. |
| I3 | A `VcpmCkv` deletion (CKV row + all parameter payloads) is atomic — either all succeed or none are applied. |
| I4 | PUT cal-data is update-only — it never creates new `VcpmParameterPayload` rows. |
| I5 | The latest write wins — if the same payload is written multiple times in the same session, `PendingChangeWriter` supersedes the prior pending change. |

---

## Error Codes Summary

| Scenario | HTTP Code |
|---|---|
| Subgraph not found | 404 |
| VcpmInstance not found (subgraph not voice-enabled) | 404 |
| VcpmCkv not found | 404 |
| No active session | 403 |
| Session mode not allowed | 403 |
| Duplicate CKV key-value combination | 422 |
| Parameter payload not found (update-only) | 207 per-parameter |
| Parameter is read-only | 207 per-parameter |
| Parameter serialization failed | 207 per-parameter |

---

## Out of Scope

- **Zero-CKV management** — the zero-CKV (empty key set) is created automatically when a subgraph becomes Voice (scenario cascade). It is not managed via these endpoints.
- **VCPM CKV GET endpoints** — covered separately (GET-1, GET-2).
- **Scenario cascade** — the Audio→Voice transition that initialises `VcpmInstance` and zero-CKV data is covered in `set-subgraph-scenario-design.md`.
- **VCPM module definition management** — definitions are read-only at runtime, populated during file upload.
