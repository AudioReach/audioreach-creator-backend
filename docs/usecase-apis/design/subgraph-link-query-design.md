<!--
 Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 SPDX-License-Identifier: BSD-3-Clause
-->

# Project Link Query API

## Document Information

- **Version:** 2.0
- **Date:** September 2026
- **Status:** Draft - pending document review
- **Feature folder:** `docs/usecase-apis/`
- **Related Swagger:** `docs/swagger-api.json`

## 1. Decision Summary

The UI will use project-level link query APIs. The usecase-level link APIs are not
part of this workflow and shall not be used:

```http
GET /arc-api/v1/projects/{projectId}/data-links
GET /arc-api/v1/projects/{projectId}/control-link
```

The existing project-level write routes remain separate from these read endpoints.
The legacy link query routes are removed and shall not be used:

```http
POST /arc-api/v1/projects/{projectId}/data-links/query
POST /arc-api/v1/projects/{projectId}/control-links/query
GET /arc-api/v1/projects/{projectId}/usecases/data-link
GET /arc-api/v1/projects/{projectId}/usecases/control-link
```

These new read endpoints use query parameters to find links by subgraph or by module
and port.

The response uses the existing Swagger wrapper DTOs:

- `DataLinkWithUsecasesResponseDto[]` for data links.
- `ControlLinkWithUsecasesResponseDto[]` for control links.

Each item contains one link and the full usecases associated with that link, as defined
by the existing Swagger contract.

## 2. Requirements

### 2.1 UI workflows

1. When a subgraph is selected or dropped, the UI queries links leaving that subgraph
   to another subgraph. Links whose two endpoints are inside the selected subgraph
   are excluded.
2. When a module port is selected, the UI queries all links connected to that module
   and port, including links associated with other usecases.
3. The UI may combine the subgraph filter with the module-port filter to narrow a
   port lookup to one subgraph.
4. The returned link shape must remain compatible with the existing data-link and
   control-link response DTOs documented in Swagger.

### 2.2 Functional requirements

| ID | Requirement |
|----|-------------|
| FR-PLQ-01 | The API shall expose project-level data-link and control-link read endpoints. |
| FR-PLQ-02 | `subgraphSystemId` shall return only cross-subgraph links leaving the requested subgraph. Links whose two endpoints are inside the requested subgraph shall be excluded. |
| FR-PLQ-03 | `moduleSystemId` and `portSystemId` shall be supplied together and shall match either link endpoint. |
| FR-PLQ-04 | `subgraphSystemId` may be combined with `moduleSystemId` and `portSystemId`; all filters shall be combined with logical AND. |
| FR-PLQ-05 | The response shall use `DataLinkWithUsecasesResponseDto[]` or `ControlLinkWithUsecasesResponseDto[]` exactly. |
| FR-PLQ-06 | Links from other usecases shall not be removed from a subgraph or module-port query. |
| FR-PLQ-07 | The active edit-session overlay shall be applied to every query. |
| FR-PLQ-08 | A valid query with no matching links shall return `200 OK` with an empty `data` array. |
| FR-PLQ-09 | The existing usecase data-link and control-link endpoints are not required for these workflows. |
| FR-PLQ-10 | The legacy project-level data-link and control-link query routes are removed; clients shall use the project-level GET endpoints. |

### 2.3 Invariants

**I1 - Data-link direction:** Data links retain their source and destination fields in
the response. With only `subgraphSystemId`, the requested subgraph must be the source
and the destination must be a different subgraph. Internal links are excluded.

**I2 - Control-link peer semantics:** Control-link response fields
`sourceSystemId`/`sourcePortSystemId` and `destinationSystemId`/`destinationPortSystemId`
represent the existing canonical peer A and peer B positions. They do not imply a
directional control-link filter.

**I3 - Module-port matching:** A module-port query matches the source or destination
endpoint for a data link and either peer endpoint for a control link.

**I4 - DTO compatibility:** The API uses the existing link-with-usecases response
wrappers and does not introduce a different response envelope.

## 3. Query Contract

### 3.1 Data-link endpoint

```http
GET /arc-api/v1/projects/{projectId}/data-links
```

Supported query parameters:

| Parameter | Required | Usage |
|-----------|----------|-------|
| `subgraphSystemId` | Conditional | Returns data links sourced by this subgraph whose destination is a different subgraph. Internal links are excluded. |
| `moduleSystemId` | Conditional | Identifies the module for a module-port lookup. Requires `portSystemId`. |
| `portSystemId` | Conditional | Identifies the port for a module-port lookup. Requires `moduleSystemId`. |

### 3.2 Control-link endpoint

```http
GET /arc-api/v1/projects/{projectId}/control-link
```

Supported query parameters:

| Parameter | Required | Usage |
|-----------|----------|-------|
| `subgraphSystemId` | Conditional | Returns control links connecting this subgraph to a different peer subgraph. Same-subgraph control links are excluded. |
| `moduleSystemId` | Conditional | Identifies the module for a module-port lookup. Requires `portSystemId`. |
| `portSystemId` | Conditional | Identifies the port for a module-port lookup. Requires `moduleSystemId`. |

The same filter names are used for both endpoints. The link type determines whether
the module-port match is applied to data-link source/destination endpoints or control-
link peer A/peer B endpoints.

### 3.3 Supported filter combinations

#### Subgraph-only query

```http
GET /arc-api/v1/projects/P/data-links?subgraphSystemId=S1
GET /arc-api/v1/projects/P/control-link?subgraphSystemId=S1
```

This is the subgraph lookup mode:

- Data links: return all links where `S1` is the source subgraph and the destination
  subgraph is different from `S1`.
- Control links: return all links where `S1` is one peer and the other peer subgraph
  is different from `S1`.
- Links are not restricted to the selected usecase.
- Dangling and non-dangling links are both returned.

The result is scoped to links leaving `S1`; internal links and links unrelated to
`S1` are not returned.

#### Module-and-port query

```http
GET /arc-api/v1/projects/P/data-links?moduleSystemId=M1&portSystemId=P1
GET /arc-api/v1/projects/P/control-link?moduleSystemId=M1&portSystemId=P1
```

This is the same lookup scope as the existing usecase component-port APIs, with the
filter renamed from `componentSystemId` to `moduleSystemId`:

- Data links: match `(source module, source port)` or
  `(destination module, destination port)`.
- Control links: match `(peer A module, peer A port)` or
  `(peer B module, peer B port)`.
- Matching links are returned across all usecases.

#### Combined subgraph and module-port query

```http
GET /arc-api/v1/projects/P/data-links?subgraphSystemId=S1&moduleSystemId=M1&portSystemId=P1
GET /arc-api/v1/projects/P/control-link?subgraphSystemId=S1&moduleSystemId=M1&portSystemId=P1
```

The result must satisfy both filters. The link must be connected to the specified
module-port, must leave `S1`, and must have a different destination/peer subgraph.

#### No query filters

No query parameters is not a supported UI query. The client must provide either:

- `subgraphSystemId`, or
- both `moduleSystemId` and `portSystemId`.

Returning every link in a project when no scope is supplied would create an unbounded
read and is not required by the UI workflow. The API should return `400 Bad Request`
when none of the supported filter combinations is supplied.

### 3.4 Validation rules

- `moduleSystemId` and `portSystemId` must be supplied together.
- `moduleSystemId` without `portSystemId` returns `400 Bad Request`.
- `portSystemId` without `moduleSystemId` returns `400 Bad Request`.
- `subgraphSystemId` may be supplied alone.
- `subgraphSystemId` may be combined with the complete module-port pair.
- All supplied filters are combined with logical AND.
- Invalid project or system identifiers return the existing API error response.

## 4. Response Contract

The endpoint returns the existing wrapper DTO array through the standard `ApiResult`
envelope. Each item contains one link and a `usecases` array. The response is not
grouped into a separate usecase hierarchy.

### 4.1 Data-link response

The response item is `DataLinkWithUsecasesResponseDto` from Swagger:

```json
{
  "data": [
    {
      "link": {
        "systemId": "L1",
        "sourceSystemId": "M1",
        "sourcePortSystemId": "P1",
        "destinationSystemId": "M2",
        "destinationPortSystemId": "P2",
        "isInterUsecase": false
      },
      "usecases": [
        {
          "systemId": "U1",
          "usecaseType": "Regular",
          "keyValuePairs": []
        }
      ]
    }
  ]
}
```

### 4.2 Control-link response

The response item is `ControlLinkWithUsecasesResponseDto` from Swagger:

```json
{
  "data": [
    {
      "link": {
        "systemId": "L2",
        "sourceSystemId": "M3",
        "sourcePortSystemId": "P3",
        "destinationSystemId": "M4",
        "destinationPortSystemId": "P4",
        "isInterUsecase": true
      },
      "usecases": [
        {
          "systemId": "U1",
          "usecaseType": "Regular",
          "keyValuePairs": []
        }
      ]
    }
  ]
}
```

For control links, `source*` is the existing peer A representation and `destination*`
is the existing peer B representation. The fields are retained for DTO compatibility;
the query does not treat them as a directional control-link relationship.

### 4.3 DTO constraint

The Swagger wrapper DTOs contain:

- `link`, using the existing data-link or control-link DTO fields.
- `usecases`, containing full `UseCaseDto` objects associated with the link.

They do not contain:

- `isDangling`.
- `usecaseSystemIds` as a compact array.
- Source/destination or peer subgraph IDs.
- A `peerSubgraphs` collection.

The API follows these existing wrapper DTOs exactly. A literal `isDangling`, compact
usecase IDs, or subgraph IDs would require a separate DTO or an explicit Swagger
contract change.

## 5. Behavioural Semantics

### 5.1 Subgraph query

The subgraph query returns cross-subgraph links leaving the requested subgraph:

```text
data link:
  sourceSubgraphSystemId = requested subgraph
  AND destinationSubgraphSystemId != requested subgraph

control link:
  (peerASubgraphSystemId = requested subgraph
   AND peerBSubgraphSystemId != requested subgraph)
  OR
  (peerBSubgraphSystemId = requested subgraph
   AND peerASubgraphSystemId != requested subgraph)
```

The response excludes links where both endpoints belong to the requested subgraph.
Control-link peer order remains irrelevant.

### 5.2 Module-port query

The module-port query is endpoint-neutral:

```text
data link:
  (sourceNodeSystemId = module AND sourcePortSystemId = port)
  OR (destinationNodeSystemId = module AND destinationPortSystemId = port)

control link:
  (peerNodeASystemId = module AND nodeAPortSystemId = port)
  OR (peerNodeBSystemId = module AND nodeBPortSystemId = port)
```

This is why the API uses `moduleSystemId`, not `sourceModuleSystemId` or
`destinationModuleSystemId`.

### 5.3 Usecase and dangling behavior

The query does not receive a usecase filter. Links from other usecases remain in the
result so the UI can explain occupied ports. The existing response wrapper includes
the complete `usecases` array for each link, and the link's `isInterUsecase` property
is preserved. No `isDangling` field is added under the current DTO-compatibility
decision.

## 6. Architecture

### 6.1 API layer

The data-link and control-link controllers expose project-level GET methods. These
methods parse the query DTO, validate the filter combinations, and dispatch core
queries. They must not query TypeORM or implement link matching directly.

Suggested signatures:

```typescript
async getDataLinks(
  projectId: string,
  query: GetProjectDataLinksQueryDto,
): Promise<ApiResult<DataLinkWithUsecasesResponseDto[]>>;

async getControlLinks(
  projectId: string,
  query: GetProjectControlLinksQueryDto,
): Promise<ApiResult<ControlLinkWithUsecasesResponseDto[]>>;
```

### 6.2 Core layer

Add project-level query operations following the existing feature convention:

```text
packages/core/src/application/usecase-designer/data-link/get-project-data-links/
  get-project-data-links.query.ts
  get-project-data-links.handler.ts

packages/core/src/application/usecase-designer/control-link/get-project-control-links/
  get-project-control-links.query.ts
  get-project-control-links.handler.ts
```

The data-link query carries:

```typescript
interface ProjectLinkFilter {
  subgraphSystemId?: number;
  moduleSystemId?: number;
  portSystemId?: number;
}
```

The same filter shape can be used for both link types because endpoint semantics are
owned by the corresponding query handler.

Each handler shall:

1. Resolve `projectId` to `fileSystemId`.
2. Validate that either `subgraphSystemId` or the complete module-port pair is present.
3. Query the appropriate link type using the active edit-session overlay.
4. Apply the subgraph and module-port predicates.
5. Map to the existing `DataLinkWithUsecasesResponseDto` or
   `ControlLinkWithUsecasesResponseDto` shape.

The handlers and core mappers must remain free of NestJS and TypeORM imports.

### 6.3 Persistence layer

Extend the existing data/control link query services with a project-scoped filter
method, or add a shared filter port implemented by both services.

Data-link predicates:

```text
optional subgraph filter:
  sourceSubgraphSystemId = requested subgraph
  AND destinationSubgraphSystemId != requested subgraph

optional module-port filter:
  sourceNodeSystemId = module AND sourcePortSystemId = port
  OR destinationNodeSystemId = module AND destinationPortSystemId = port
```

Control-link predicates:

```text
optional subgraph filter:
  (peerNodeA subgraph = requested subgraph
   AND peerNodeB subgraph != requested subgraph)
  OR
  (peerNodeB subgraph = requested subgraph
   AND peerNodeA subgraph != requested subgraph)

optional module-port filter:
  peerNodeASystemId = module AND nodeAPortSystemId = port
  OR peerNodeBSystemId = module AND nodeBPortSystemId = port
```

When both filters are present, both predicates must match. All queries must include
the active edit-session overlay, including staged link creates, updates, and deletes.

## 7. Error Handling

| Condition | Response |
|-----------|----------|
| Neither `subgraphSystemId` nor the complete module-port pair supplied | `400 Bad Request` |
| Only one of `moduleSystemId` and `portSystemId` supplied | `400 Bad Request` |
| Invalid project or system identifier | Existing API validation response |
| Project not found | `404 Not Found` |
| Valid query with no matching links | `200 OK` with `data: []` |
| Persistence failure | Existing query failure mapping, normally `422` |

## 8. Testing Requirements

### 8.1 Core unit tests

- Reject a query with no filters.
- Reject a module-only query.
- Reject a port-only query.
- Accept a subgraph-only query.
- Accept a module-port-only query.
- Accept all three filters together.
- Return only outgoing cross-subgraph data links for a subgraph.
- Return cross-subgraph control links in either peer order.
- Match module-port filters on both data-link endpoints.
- Match module-port filters on both control-link peer endpoints.
- Map the exact existing link-with-usecases response DTO fields.

### 8.2 Persistence integration tests

- Return only outgoing cross-subgraph data links for a requested subgraph.
- Return only cross-subgraph control links for a requested subgraph.
- Return module-port links across usecases.
- Apply the intersection of subgraph and module-port filters.
- Include staged link creates and exclude staged link deletes.
- Preserve the existing link endpoint and `isInterUsecase` values.

### 8.3 API end-to-end tests

- Query data links with `subgraphSystemId`.
- Query control links with `subgraphSystemId`.
- Query data links with `moduleSystemId` and `portSystemId`.
- Query control links with `moduleSystemId` and `portSystemId`.
- Query both endpoints with all three filters.
- Reject missing module or port filters.
- Reject an unfiltered request.
- Verify `DataLinkWithUsecasesResponseDto[]` and
  `ControlLinkWithUsecasesResponseDto[]` response shapes.

## 9. Swagger and Compatibility

The requested GET routes are:

```http
GET /arc-api/v1/projects/{projectId}/data-links
GET /arc-api/v1/projects/{projectId}/control-link
```

The current Swagger file already defines the `DataLinkWithUsecasesResponseDto` and
`ControlLinkWithUsecasesResponseDto` schemas. Swagger must be regenerated after these
project-level GET methods and query DTOs are implemented.

The existing project-level POST routes remain separate from these GET read routes.
The legacy query routes are not part of the contract and must not be reintroduced when
Swagger is regenerated:

```text
/arc-api/v1/projects/{projectId}/data-links/query
/arc-api/v1/projects/{projectId}/control-links/query
/arc-api/v1/projects/{projectId}/usecases/data-link
/arc-api/v1/projects/{projectId}/usecases/control-link
```

## 10. Open Implementation Notes

- The project-level GET methods are new read operations and must be wired through
  CQRS.
- The user-requested control route is singular `/control-link`; the existing Swagger
  create route is plural `/control-links`. Both route families must be kept distinct.
- Existing `DataLinkWithUsecasesResponseDto` and `ControlLinkWithUsecasesResponseDto`
  do not expose subgraph IDs. If the UI needs the peer subgraph ID directly from a
  link response, the DTOs must be extended or the UI must resolve it through the
  loaded module/subgraph data.
- Existing link DTOs expose `isInterUsecase`, not `isDangling`. A literal
  `isDangling` response property requires a DTO and Swagger contract change.
- The current link query services and `LinkOverlayFetcher` already contain the link
  endpoint and subgraph data needed to implement the filters.
