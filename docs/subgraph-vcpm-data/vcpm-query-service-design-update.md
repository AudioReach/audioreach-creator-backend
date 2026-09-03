<!--
  Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
  SPDX-License-Identifier: BSD-3-Clause
-->

# VCPM Query-Service Design Update

This document records the revised query-service design for the VCPM CKV GET
endpoints. The public query methods are scoped to the endpoint data required,
while VCPM instance relationships remain an infrastructure concern.

## Public query-service methods

Following the SPF query-service pattern, the `VcpmQueryService` exposes two
endpoint-oriented aggregate methods:

```ts
getVcpmCkvSummaryBySubgraph(...)
getVcpmCkvCalData(...)
```

Their endpoint responsibilities are:

| Endpoint | Method | Data required |
|---|---|---|
| `GET /subgraphs/:id/vcpm-ckv` | `getVcpmCkvSummaryBySubgraph` | CKV key/value data, parameter-to-CKV relationships, and parameter metadata. Binary payload content is not required. |
| `GET /subgraphs/:id/vcpm-ckv/:ckvSystemId/cal-data` | `getVcpmCkvCalData` | One CKV, its binary parameter payloads, and parameter metadata required to parse the payloads. |

The aggregate methods hide persistence-specific composition from the handlers.
The summary method uses parameter-to-CKV links to identify configured
parameters and their associated CKVs; it does not need to return binary payload
data. The cal-data method loads one CKV and its payloads, optionally filtered by
parameter system IDs.

The following lower-level methods are internal fetcher operations rather than
public query-service methods:

```ts
fetchManyBySubgraph(...)
fetchOne(...)
fetchLinksBySubgraph(...)
fetchManyByCkv(...)
fetchManyParameterDefinitions(...)
```

## Infrastructure fetchers

The persistence layer follows the existing fetcher composition pattern:

```text
DbVcpmQueryService
  ├── VcpmOverlayFetcher
  └── VcpmParameterPayloadFetcher
```

`DbVcpmQueryService` composes granular fetcher operations, following the SPF
`DbSpfTuningConfigService` pattern:

```text
getVcpmCkvSummaryBySubgraph
  ├── VcpmOverlayFetcher.fetchManyBySubgraph
  ├── VcpmParameterPayloadFetcher.fetchLinksBySubgraph
  ├── parameter-definition fetcher
  └── KeyValueDefQueryService

getVcpmCkvCalData
  ├── VcpmOverlayFetcher.fetchOne
  ├── VcpmParameterPayloadFetcher.fetchManyByCkv
  └── parameter-definition fetcher
```

`VcpmOverlayFetcher` owns VCPM CKV queries and applies CKV session overlays.
`VcpmParameterPayloadFetcher` owns parameter-payload queries and their
create/update/delete session overlays. The payload fetcher is separate because
`vcpm_parameter_payload` is a directly related child table with its own
overlay behavior. Fetchers should remain granular and reusable; endpoint
aggregation belongs in `DbVcpmQueryService`.

Fetcher methods use the infrastructure naming convention (`fetch...`). Public
query-service methods use the application naming convention (`get...`).

## Mapping and query scope

Fetchers return raw persistence rows. In particular, `vcpm_ckv_values` returns
`valueDefSystemId` values. `DbVcpmQueryService` resolves those IDs to full
key/value DTOs through `KeyValueDefQueryService` and maps the result to the
application read models.

All VCPM queries must be scoped through the requested `fileSystemId` and the
subgraph relationship. This preserves the project/file/subgraph ownership
boundary and matches the scoping used by existing subgraph fetchers.
