# Temporary Chain Resolver Stub Design

**Requirements:** [`../requirements/chain-resolver-stub-requirements.md`](../requirements/chain-resolver-stub-requirements.md)

## Goal

Let PR-02 compile and register routing handlers while real subsystem data/control
chain resolution is unavailable. The temporary service must fail safely before a
handler performs cleanup or routing work.

## Architecture

Add `SubsystemLinkResolutionService` in `@arc/core` application code. It is a
concrete, stateless service rather than a port or infrastructure adapter.

```typescript
export class SubsystemLinkResolutionService {
  async resolveAllChains(_uow: UnitOfWork): Promise<Result<void>> {
    // Returns a generic failed Result; the temporary service has no side effects.
  }
}
```

Each routing handler constructs its own instance as a private field:

```typescript
private readonly subsystemLinkResolutionService =
  new SubsystemLinkResolutionService();
```

`ArcCqrsModule`, `CommandBus`, the command-handler dependency bag, and registry
factory signatures do not change for this temporary service.

## Handler Flow

After a handler starts its UoW transaction, it calls:

```typescript
const resolution = await this.subsystemLinkResolutionService.resolveAllChains(
  this.uow,
);
```

The temporary service returns a generic failed `Result`. The handler converts that
result through the existing domain-failure path, rolls back its transaction, and
does not perform any later step.

For automatic routing, the failure occurs before AUTO_ROUTING cleanup, graph-input
reads, engine execution, cache flush, and commit. For manual routing, it occurs
before graph-input reads, pair discovery, engine execution, cache flush, and commit.

PR-02 controllers remain HTTP 501, so the temporary service is not reachable through
an active routing endpoint.

## Testing

Add core unit tests proving that each handler:

1. starts its transaction;
2. invokes `resolveAllChains`;
3. rolls back on the generic failed result; and
4. does not invoke cleanup, input reads, manual pair discovery, the engine, cache
   flush, or commit.

Test the service directly to prove it returns a failed result and does not call the
provided UoW. Successful resolver-path handler tests are deferred until the real
resolver exists.

## Replacement Boundary

A later subsystem-links resolver PR implements the existing
`SubsystemLinkResolutionService.resolveAllChains` method. It will use the supplied UoW
to coordinate data/control plane resolution, overlay reads, and staged writes. This
replaces service internals only: routing-handler fields, transaction sequencing, and
manual CQRS wiring remain unchanged.

## Scope Boundaries

This design adds no resolver interface, repository method, database schema, migration,
data/control chain algorithm, overlay read, derived-link write, or endpoint activation.
