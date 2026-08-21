<!--
  Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
  SPDX-License-Identifier: BSD-3-Clause
-->

# Set Subgraph VCPM CKV — Corrective Design

**Status:** Superseded by `set-subgraph-vcpm-ckv-design.md`
**Date:** 2026-09-11
**Requirements:** [../set-subgraph-vcpm-ckv-requirements.md](../set-subgraph-vcpm-ckv-requirements.md)
**Supersedes:** the VCPM CKV portions of `set-subgraph-vcpm-ckv-design.md` that conflict with this document.

## 1. Scope and Decisions

This correction makes the POST, DELETE, and PUT VCPM CKV operations usable and
consistent with the project’s command/query boundary and staged-write model.

The following decisions are frozen:

- PUT cal-data follows the existing SPF PUT model: validation and serialization
  are all-or-nothing. A failed submitted parameter stages no payload update.
- Command handlers do not depend on `QueryServices`.
- A VCPM CKV CREATE action stores its value-definition IDs in the CREATE payload.
  `vcpm_ckv_values` is not written during staging.
- The generic commit materializer is assumed to exist. Its VCPM CKV applier must
  materialize the parent CKV first, then insert its value rows from that payload.
- No persistence-schema migration is needed.

## 2. Command-Side Read Ports

Add two narrow command-side ports in `packages/core` and expose them from
`UnitOfWork`:

```ts
export interface VcpmDefinitionRepository {
  getDefinitionWithParameters(
    fileSystemId: number,
  ): Promise<VcpmModuleDefinitionWithParams | null>;
}

export interface KeyValueDefinitionRepository {
  getSummariesForValues(
    fileSystemId: number,
    valueSystemIds: readonly number[],
  ): Promise<Array<{keyId: number; valueId: number}>>;
}
```

`TypeOrmUnitOfWork` constructs TypeORM adapters using its request-bound
`EntityManager`. The adapters reuse the existing VCPM-definition and key/value
fetching logic, but are command-side repository implementations. The create
handler uses both ports; the update handler uses only the VCPM definition port.

This mirrors SPF PUT cal-data: its handler obtains parameter definitions through
`uow.getModuleDefinitionRepository()`, while its GET handler uses `QueryServices`.

## 3. VCPM CKV Overlay

Introduce persistence fetchers parallel to the SPF CKV fetchers:

- `VcpmCkvOverlayFetcher.fetchOne/fetchMany` loads baseline `VcpmCkv` rows,
  applies `VcpmCkv` actions scoped by `aggregateId = subgraphSystemId`, and
  exposes `valueDefSystemIds` from a staged CREATE payload.
- `VcpmParameterPayloadFetcher.fetchMany` loads baseline payload rows and
  applies payload CREATE, UPDATE, and DELETE actions with the same aggregate
  scope. It includes same-session payload CREATEs for POST → PUT.

`SubgraphRepository` delegates CKV existence, duplicate detection, and payload
lookup to these fetchers. This removes the broken inline overlay implementation
and guarantees that staged deletes are invisible to DELETE/PUT and staged creates
are immediately visible to PUT.

## 4. POST Create VCPM CKV

1. Parse every supplied value system ID with `parseId`; reject duplicate input
   IDs before persistence.
2. Validate the subgraph, load the one VCPM definition and its parameters through
   `VcpmDefinitionRepository`, then load the matching VCPM instance.
3. Use `VcpmCkvOverlayFetcher` to reject an effective duplicate combination.
4. In one transaction, stage:
   - `VcpmCkv` CREATE with `{vcpmInstanceSystemId, valueDefSystemIds}`;
   - one default `VcpmParameterPayload` CREATE per VCPM parameter.
5. Resolve the natural key/value response pairs through
   `KeyValueDefinitionRepository` and return `CreateVcpmCkvDto`.

The repository must not insert `VcpmCkvValues` while the CKV is staged. The
assumed commit materializer owns inserting those canonical composite rows after
it materializes the parent CKV.

## 5. DELETE VCPM CKV

The handler validates subgraph and effective CKV existence through the overlay,
then starts a transaction. It stages DELETE actions for each effective payload
and for the CKV parent, commits, and rolls back on any error. The commit
materializer applies the parent delete and relies on the schema’s cascade for
canonical `vcpm_ckv_values` rows.

## 6. PUT VCPM Cal-Data

The handler follows the SPF PUT structure:

1. Validate subgraph and effective CKV existence.
2. Fetch effective payload entries and parameter definitions through command-side
   repositories.
3. Validate and serialize every request entry before beginning the write. Missing
   payloads throw `ResourceNotFoundException`; read-only or invalid elements throw
   `InvalidOperationException`.
4. When all entries are valid, start one transaction and write payload deltas with
   `writeDeltaBatch`; commit or roll back as a unit.
5. Return all submitted payload system IDs and `groupId`. The controller re-queries
   the completed `GetVcpmCalDataQuery` handler for the response.

No `Result.partial`, issue collection, or HTTP 207 response is produced by this
endpoint.

## 7. VCPM Read Handlers

Implement `GetVcpmCalDataHandler` using query-side VCPM query services. It must:

1. resolve the file from the project;
2. validate subgraph and CKV ownership in the effective session view;
3. obtain effective payloads, honoring optional payload-ID filtering;
4. load VCPM parameter definitions, deserialize payloads, and return
   `CkvCalDataDto`.

The GET handler is the only query-side dependency used by the PUT response path.

## 8. Tests and Verification

### Core unit tests

- Assert create/update handler constructors need no `QueryServices`.
- POST: invalid ID, duplicate input ID, missing subgraph/definition/instance,
  effective duplicate, default payload staging, rollback.
- DELETE: missing subgraph/CKV and rollback after a staged child delete fails.
- PUT: missing payload/read-only/serialization failures abort the entire request;
  success writes the complete batch; rollback on write error.
- GET cal-data: project/subgraph/CKV not found, staged payload visibility, and
  filtering.

### Persistence integration tests

- Effective CKV duplicate and existence behavior for committed, staged CREATE,
  and staged DELETE rows.
- POST emits no canonical `vcpm_ckv_values` rows during staging and carries the
  value IDs in the CREATE action payload.
- POST → PUT resolves staged payload CREATEs.
- DELETE stages the payload and parent actions atomically.
- PUT writes one batch of payload deltas and supersedes prior deltas.

### API end-to-end tests

- POST/DELETE/PUT reject absent or disallowed sessions.
- POST validates duplicate and creates a CKV without a seeded canonical parent.
- PUT success returns cal-data; each invalid input returns SPF-equivalent 404/400
  and leaves no payload delta.
- DELETE returns 204 and makes the CKV unavailable in the session overlay.

## 9. Alignment and Non-goals

The design covers staged POST/DELETE/PUT, same-session overlay visibility,
all-or-nothing PUT, command-side metadata access, and group IDs. It preserves
the existing schema and leaves zero-CKV management, scenario cascade, and VCPM
definition administration out of scope.

The generic commit materializer itself is not designed or implemented here; the
caller explicitly established it as a platform capability. This change only
defines the `VcpmCkv` CREATE payload that its VCPM applier consumes.
