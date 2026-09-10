# Subsystem Overlay Parent ID: Design

## Requirements

### Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-01 | `OverlaidSubsystem.parentSystemId` is represented as `number | null`. |
| FR-02 | A root subsystem whose node parent is SQL `NULL` is returned with `parentSystemId: null`. |
| FR-03 | Nested and session-overlaid subsystems retain their numeric parent ID. |
| FR-04 | Focused integration coverage verifies the root-subsystem result. |

### Invariants

**I1:** The fetcher must not represent the same missing parent as `undefined` in one result path and `null` in another.

### Out of Scope

- API response changes.
- Database schema or migration changes; the existing node parent column is already nullable.
- Broader changes to core subsystem entities or unrelated consumers.

## Design

`SubsystemOverlayFetcher` will normalize the raw TypeORM join result at the database boundary. Its parent-ID lookup map and `OverlaidSubsystem` contract will use `number | null`; SQL `NULL` becomes `null`, while numeric values remain numbers. Overlay-created and overlay-updated nodes will use the same nullable type through the existing merge path. Persistence consumers that feed older optional-parent read models or domain constructors will convert `null` back to `undefined` at those boundaries without changing their external behavior.

The focused integration suite will assert that a baseline root subsystem returns `parentSystemId: null`. Existing child and overlay tests continue to verify numeric parent IDs and session behavior.

## Verification

Run the persistence integration test for `subsystem-overlay-fetcher.spec.ts`, followed by the persistence package typecheck/build if the focused test passes.
