<!--
Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
SPDX-License-Identifier: BSD-3-Clause
-->

# API Side-Effects Response Pattern

**Date:** 2026-07-18  
**Status:** Accepted  
**Related documents:**
- `api-error-handling-design.md` — exception hierarchy, response envelope
- `api-issue-item-design.md` — ApiResult and ApiIssueItem shape
- `../modification-framework/modification-framework-design.md` — edit_actions versioning and undo/redo

---

## 1. Problem Statement

Some API operations perform a primary action but also implicitly add or remove other entities as a
result of domain invariant enforcement. These are not errors — they are expected, silent side
effects.

**Examples:**

| Endpoint | Primary operation | Implicit side effect |
|---|---|---|
| `POST /:spfModuleSystemId/ckvs` | Create the requested calibration bins | Remove the zero placeholder CKV if it exists |
| `DELETE /:spfModuleSystemId/ckv-parameters` | Remove parameters from all CKVs | Delete any CKVs that now have no parameters |
| `DELETE /:spfModuleSystemId` *(planned)* | Remove the SPF module | Delete the container and subgraph if this was the last module |

The client needs to know about all affected entities — primary and implicit — for two reasons:

1. **Client state synchronisation** — the client maintains a local model of the session. If the
   server silently removes an entity, the client's state becomes stale.
2. **Undo/redo stack construction** — the client maintains the undo/redo stack. To record a correct
   undo entry it must know every entity that changed, not just the ones it explicitly requested.

---

## 2. Undo/Redo Context

This project uses a server-side version-history model (see modification-framework design, section 9).
The `edit_actions` table stores every pending change. Rows are never deleted; a `valid_until`
timestamp marks superseded versions. The client drives undo/redo by calling `POST /activate-change`
or `POST /deactivate-change` with a `change_id`.

**Atomicity is guaranteed server-side via `group_id`.** All `edit_actions` rows written by a single
logical request — primary operation and all side effects — share one `group_id`. When the client
calls `activate-change` for that group, every affected entity is reverted atomically.

**The undo mechanism itself does not need the response to be complete.** The server already handles
atomicity. The requirement for complete responses is a *client state synchronisation* requirement:
the client cannot know which entities to remove from its local state unless the server reports them.

---

## 3. Options Considered

### Option A — Named side-effect fields per endpoint *(chosen)*

Each response DTO carries explicitly named fields for the implicit changes:
- `removed<EntityType>SystemIds` for entities implicitly removed
- `added<EntityType>SystemIds` for entities implicitly created

```typescript
// POST /ckvs
class AddCkvsResponse {
  addedCkvs: CkvDto[];
  removedCkvSystemIds: string[];
}

// DELETE /ckv-parameters
class RemoveCkvParametersResponse {
  removedParameterSystemIds: number[];
  removedCkvSystemIds: string[];   // implicit — CKVs deleted because last param was removed
  affectedCkvSystemIds: string[];  // explicit — CKVs still alive, parameter stripped from them
}
```

**Pros:**
- Fully type-safe — no string-keyed maps, no `any`
- Each field is self-documenting in Swagger
- Follows the existing DTO pattern already used in `CkvParameterRemovalResponse` and
  `TkvParameterRemovalResponse`

**Cons:**
- No shared base type; consistency depends on the naming convention being followed

---

### Option B — Generic `sideEffects` envelope

A shared type carries all implicit changes as arrays of `{ entityType: string, systemIds: string[] }`.

```typescript
class SideEffects {
  removed?: { entityType: string; systemIds: string[] }[];
  added?: { entityType: string; systemIds: string[] }[];
}

class AddCkvsResponse {
  addedCkvs: CkvDto[];
  sideEffects: SideEffects;
}
```

**Pros:** One shared type; a single undo/redo helper could process all responses uniformly.

**Cons:**
- `entityType` is a stringly-typed discriminator — loses compile-time safety and Swagger clarity
- Undo/redo logic is per-operation regardless, so the "single helper" benefit does not materialise
  in practice

---

### Option C — Encode side effects in `ApiResult.issues`

Represent implicit changes as `ApiIssueItem` entries in the existing `issues` field.

**Rejected immediately.** `ApiResult.issues` carries validation and operational warnings (see
`api-issue-item-design.md`). Placing structured entity payloads there misuses the channel,
breaks type safety, and conflates "something went wrong" with "something else also changed".

---

### Industry precedent

Major REST APIs (GitHub, Stripe, Kubernetes) generally return only the primary resource state and
do not enumerate side effects:

- GitHub `PUT /pulls/:id/merge` returns `{ sha, merged: true }` only — closed issues and deleted
  branches are not listed ([docs](https://docs.github.com/en/rest/pulls/pulls))
- Stripe `DELETE /subscriptions/:id` returns the subscription with `status: "canceled"` — voided
  invoices and removed payment methods are not listed ([docs](https://docs.stripe.com/api/subscriptions/cancel))
- Kubernetes `DELETE /deployments/:name` returns only a `Status` object in background mode —
  cascaded pod deletions are not enumerated ([docs](https://kubernetes.io/docs/reference/kubernetes-api/workload-resources/deployment-v1/))

These APIs do not have a client-side undo/redo stack that requires exact knowledge of implicit
changes. The AudioReach Creator client does, so this precedent does not apply.

---

## 4. Decision: Option A

> **Naming rule:** Any field representing entities removed as a domain side effect is named
> `removed<EntityType>SystemIds`. Any field representing entities created as a side effect is
> named `added<EntityType>SystemIds`. These fields are peers of the primary result fields in the
> same response DTO. They are always present (never omitted) and are empty arrays when no side
> effect occurred.

**Rationale:**

- Per-endpoint DTOs are the established pattern (`CkvParameterRemovalResponse`,
  `TkvParameterRemovalResponse`). Option A extends that pattern; Option B introduces a new one.
- Type safety and Swagger readability outweigh the theoretical benefit of a single shared type,
  because the client processes each operation differently regardless.
- Always-present empty arrays (rather than optional fields) make the client contract predictable:
  the client can always iterate over `removedCkvSystemIds` without a null check.

---

## 5. Concrete DTOs

```typescript
// POST /:spfModuleSystemId/ckvs
export class AddCkvsResponse {
  addedCkvs!: CkvDto[];
  removedCkvSystemIds!: string[];   // zero CKV removed; empty array if no zero CKV existed
}

// DELETE /:spfModuleSystemId/ckv-parameters
export class RemoveCkvParametersResponse {
  removedParameterSystemIds!: number[];
  removedCkvSystemIds!: string[];   // CKVs deleted because their last parameter was removed
  affectedCkvSystemIds!: string[];  // CKVs still alive; the parameter was stripped from them
}

// DELETE /:spfModuleSystemId  (endpoint not yet implemented; DTO defined for when it is)
export class RemoveSpfModuleResponse {
  removedModuleSystemId!: string;
  removedContainerSystemId?: string;   // present only if container was cascade-deleted
  removedSubgraphSystemId?: string;    // present only if subgraph was cascade-deleted
}
```

Note: `removedContainerSystemId` and `removedSubgraphSystemId` are optional because the cascade
only occurs when the deleted module was the last one. An empty/absent value means the container
and subgraph still exist.

---

## 6. Server-Side Obligation

All `edit_actions` rows written by a single logical request — primary operation and all side effects
— **must share one `group_id`**. This is what makes `activate-change` revert everything atomically.

This is a server-side invariant enforced in command handlers. It is not visible in the HTTP
response, but it is a required companion to complete responses: a response that reports side effects
but does not group them atomically under one `group_id` would leave undo/redo in an inconsistent
state.
