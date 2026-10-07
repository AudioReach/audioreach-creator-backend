<!--
  Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
  SPDX-License-Identifier: BSD-3-Clause
-->

# Set Subgraph VCPM CKV — CQRS Review Note

**Status:** Design note
**Date:** 2026-09-08
**Related design:** [set-subgraph-vcpm-ckv-design.md](./set-subgraph-vcpm-ckv-design.md)

## Context

The VCPM CKV LLD injects `QueryServices` into the create and update command
handlers. This creates a dependency from the command side to the query side.

CQRS does not prohibit command handlers from reading state. Commands must read
state to validate requests and apply changes. However, those reads should use
command-side repositories or dedicated application ports, rather than query-side
services intended for `QueryBus` operations.

## Findings

### `CreateVcpmCkvHandler`

The handler currently uses:

- `VcpmDefinitionQueryService` to load the VCPM definition and parameter definitions.
- `KeyValueDefQueryService` to resolve natural `keyId` and `valueId` values for the response.

These dependencies couple the command handler to the query side.

### `UpdateVcpmCalDataHandler`

The handler currently uses `VcpmDefinitionQueryService` to load parameter
definitions for read-only validation and payload serialization. This is the same
command/query boundary problem.

### `DeleteVcpmCkvHandler`

The delete handler is aligned with the CQRS boundary. It uses the command-side
`SubgraphRepository` through the `UnitOfWork` for subgraph and CKV existence
checks, then stages the delete. Existence checks are valid command-side reads;
they are not query-side operations merely because they read data.

## Decision

Command handlers for this feature must not depend on `QueryServices`.

The following dependencies should be exposed through command-side ports or
repositories in `packages/core`:

- A VCPM definition port for loading the definition and parameter metadata needed
  to create defaults and serialize updates.
- A key/value definition port for resolving response data when that resolution is
  required inside the command workflow.

Infrastructure implements these ports using the existing persistence layer. The
handlers continue to write through `SubgraphRepository` and `UnitOfWork`.

### Command-side VCPM metadata port

Command handlers still need to read VCPM metadata in order to validate and build
write operations. The metadata includes:

- VCPM parameter definitions.
- `elementsStructure` and default values used to create payloads.
- `isReadOnly`, used to validate calibration-data updates.

This metadata should be exposed through a command-side port, for example:

```typescript
export interface VcpmDefinitionPort {
  getDefinitions(fileSystemId: number): Promise<VcpmDefinition[]>;
}
```

The intended dependency flow is:

```text
CreateVcpmCkvHandler / UpdateVcpmCalDataHandler
  → VcpmDefinitionPort
  → persistence adapter
  → database
```

This does not move or duplicate the metadata in the database. It only keeps
command handlers independent from the read-side `QueryServices` used by
`QueryBus` and GET operations. `DeleteVcpmCkvHandler` does not need this port
because deletion requires no VCPM definition metadata.

## Response projection consideration

The requirements say that POST should return `CreateVcpmCkvDto` directly with
natural `keyId` and `valueId` fields and no re-query. That requirement is in
tension with strict CQRS if those fields are obtained from a query-side service.

Two valid options are:

1. Resolve the natural IDs through a command-side definition port before the
   command returns.
2. Have the command return the staged CKV identity and `groupId`, then execute a
   query to build the API response, as the PUT endpoint already does.

Option 1 preserves the current response contract but adds a command-side read
   port. Option 2 provides the cleanest CQRS separation but changes the stated
   POST response flow. The choice should be made explicitly before implementation.

## Required LLD updates

The VCPM CKV LLD should be updated to:

1. Remove `QueryServices` from `CreateVcpmCkvHandler` and
   `UpdateVcpmCalDataHandler` constructors.
2. Add command-side ports for VCPM parameter metadata and, if needed, key/value
   response resolution.
3. Update command-handler registry wiring accordingly.
4. Keep `DeleteVcpmCkvHandler` unchanged with respect to query-side dependencies.
5. Add unit tests verifying that command handlers use command-side ports and do
   not require `QueryServices`.
6. Resolve the POST response projection choice before implementation begins.

## Non-goals

This note does not change endpoint behavior, staging semantics, transaction
ownership, or the persistence schema. It records the dependency-boundary issue
and the design correction required for CQRS compliance.
