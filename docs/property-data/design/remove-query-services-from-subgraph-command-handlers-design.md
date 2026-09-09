# Remove QueryServices from Subgraph Command Handlers

## Requirements

### Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-01 | `UpdateSubgraphPropertyHandler`, `UpdateSubgraphScenarioHandler`, and `UpdateSubgraphVsidHandler` must not receive `QueryServices`. |
| FR-02 | The `SubgraphRepository` port must expose the definition reads required by those handlers. |
| FR-03 | The TypeORM Subgraph repository must implement those reads using existing persistence fetchers/query logic and the active edit-session overlay. |
| FR-04 | Command-handler registration must stop passing `QueryServices` to the three affected handlers. |
| FR-05 | Existing results, validation, error behavior, and transaction behavior must remain unchanged. |

### Invariants

**I1:** `packages/core` may depend only on core ports and read models; it must not depend on TypeORM or persistence adapters.

**I2:** Unrelated command handlers that still require `QueryServices` remain unchanged.

### Out of Scope

- Redesigning `addProperty` to accept a prepared payload.
- Moving zero-CKV/default-data business logic from persistence into core.
- Refactoring all query-service consumers in the application.

## Design

### Core repository contract

Extend `SubgraphRepository` with these read methods:

- `getAllSubgraphPropertyDefinitionsSummary(fileSystemId, propertyNaturalId?)`
- `getSubgraphPropertiesWithElements(fileSystemId)`
- `getSubgraphPropertyWithElements(propertySystemId, fileSystemId)`
- `getAllVcpmModuleDefinitions(fileSystemId)`

The property methods reuse the existing core read-model and `Result` types. The VCPM method returns `VcpmModuleDefinitionWithParamsReadModel[]`.

### Persistence adapter

`TypeOrmSubgraphRepository` will:

- Construct and use `SubgraphPropertyDefinitionFetcher` for property-definition reads.
- Pass the active write-session ID to preserve overlay behavior.
- Map persistence rows to the existing core read models and `Result` values.
- Move the existing VCPM definition query logic into repository methods without changing its result shape.

### Handlers and registration

The three handlers will obtain the Subgraph repository once from `UnitOfWork` and use it for all required definition reads. Their constructors will accept only `UnitOfWork`.

The command registry will continue exposing `QueryServices` to unrelated handlers, but the three Subgraph factories will no longer pass it.

### Verification

- Update affected unit-test mocks to implement the repository read methods.
- Add or update persistence integration coverage for property and VCPM definition reads through `TypeOrmSubgraphRepository`.
- Run core and persistence typechecks/tests. Existing unrelated failures will be reported separately.
