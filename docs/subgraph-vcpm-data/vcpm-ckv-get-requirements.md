<!--
  Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
  SPDX-License-Identifier: BSD-3-Clause
-->

# Requirements: VCPM CKV GET APIs

**Feature folder:** `docs/property-data/`
**Status:** REVIEWED
**Date:** 2026-08-19
**Reference:** `docs/property-data/design/property-write-api-design.md`

---

## Context

Two GET endpoints for reading VCPM (Voice Calibration Parameter Manager) CKV (Calibration Key-Value) data under a subgraph. VCPM CKVs associate calibration parameters with key-value pairs, allowing parameter data to be indexed by use-case keys.

GET endpoints apply the session overlay so staged (uncommitted) creates and deletes are reflected in responses.

---

## Definitions

| Term | Meaning |
|---|---|
| VCPM | Voice Calibration Parameter Manager — manages calibration data indexed by key-value pairs. |
| CKV | Calibration Key-Value — a set of `(keyId, valueId)` pairs that identify a calibration index. |
| Configured Parameter | A parameter on the subgraph that has been configured with at least one CKV. |
| Cal Data | Binary calibration payload associated with a parameter under a specific CKV. |

---

## Functional Requirements — GET /subgraphs/:id/vcpm-ckv

### FR-VG1-01 — Endpoint definition

`GET /arc-api/v1/projects/:projectId/subgraphs/:subgraphSystemId/vcpm-ckv`

### FR-VG1-02 — Subgraph existence

`subgraphSystemId` must refer to a non-deleted subgraph in the session's file. → `404` if not found.

### FR-VG1-03 — Response

Returns `VcpmCkvResponseDto`:

```json
{
  "configuredParams": [
    {
      "paramSystemId": "string",
      "paramName": "string",
      "associatedCkvs": [
        {
          "ckvSystemId": "string",
          "ckv": [
            {
              "key": { "keyId": "number", "name": "string", "systemId": "string" },
              "value": { "valueId": "number", "name": "string", "systemId": "string" }
            }
          ]
        }
      ]
    }
  ]
}
```

Each `ckv` entry uses `KeyValueInfoDto` — same shape as the module API. Each entry represents one configured parameter and all CKVs associated with it. → `200`.

---

## Functional Requirements — GET /subgraphs/:id/vcpm-ckv/:ckvSystemId/cal-data

### FR-VG2-01 — Endpoint definition

`GET /arc-api/v1/projects/:projectId/subgraphs/:subgraphSystemId/vcpm-ckv/:ckvSystemId/cal-data`

Optional query parameter: `?param-system-ids=1,2,3` — filters the returned parameters to the specified system IDs.

### FR-VG2-02 — Subgraph existence

`subgraphSystemId` must refer to a non-deleted subgraph in the session's file. → `404` if not found.

### FR-VG2-03 — CKV existence

`ckvSystemId` must refer to a non-deleted CKV under the resolved subgraph. → `404` if not found.

### FR-VG2-04 — Response

Returns `CkvCalDataResponseDto` (reuse existing — same shape as SPF module cal data GET). → `200`.

- When `?param-system-ids` is provided, only parameters whose `systemId` is in the filter list are returned.
- When `?param-system-ids` is not provided, all parameters under the CKV are returned.

---

## Cross-Cutting Requirements

### FR-CCR-01 — Session overlay for reads

Both GET endpoints apply the session overlay so staged (uncommitted) creates and deletes are reflected in responses.

---

## Error Codes Summary

| Scenario | HTTP Code |
|---|---|
| Subgraph not found | 404 |
| CKV not found | 404 |

---

## Out of Scope

- **Write operations** (POST, DELETE, PUT) — covered in a separate requirements document.
- **Commit / undo / redo** — session lifecycle handled by the modification framework, not by these endpoints.
