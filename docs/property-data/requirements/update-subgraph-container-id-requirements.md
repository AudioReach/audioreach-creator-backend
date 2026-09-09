<!--
  Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
  SPDX-License-Identifier: BSD-3-Clause
-->

# Replace Subgraph Container ID: Requirements

**Date:** 2026-09-12  
**Status:** Draft

---

## 1. Context

### 1.1 Problem statement

Clients need to replace one container natural ID with another for the modules
in a subgraph. A client cannot supply a container `systemId` for a container
that does not yet exist because that ID is assigned internally by the system.

### 1.2 What this builds on

This requirement covers only the subgraph container-ID endpoint described in
the existing property-data API design. That design document is not modified by
this requirement. Where the two documents differ for this endpoint, this
document is the requirements source for the endpoint.

### 1.3 Key decisions already made

- The endpoint uses `PUT` because it fully replaces the specified container ID
  assignment.
- The client supplies natural IDs, never persistence `systemId` values.
- A successful request returns `204 No Content`.

---

## 2. Definitions

| Term | Definition |
|---|---|
| Container natural ID | The integer `containerId` from the ACDB domain model. It is meaningful to clients and is distinct from `systemId`. |
| Container system ID | The internally assigned persistence identifier. The server resolves or assigns it; clients do not submit it to this endpoint. |
| Source container | The container identified by `oldContainerNaturalId`. |
| Target container | The existing or newly created container identified by `newContainerNaturalId`. |
| Active file scope | The file/database scope selected by the authenticated active session. |

---

## 3. Functional Requirements

### 3.1 API contract

#### FR-SCI-01: Replace a subgraph container ID

The system SHALL expose:

```http
PUT /arc-api/v1/projects/:projectId/subgraphs/:subgraphSystemId/container-id
```

The endpoint SHALL require an authenticated active session.

#### FR-SCI-02: Request body uses natural IDs

The request body SHALL contain the integer ACDB natural IDs of both the source
and target containers:

```json
{
  "oldContainerNaturalId": 100,
  "newContainerNaturalId": 200
}
```

The endpoint SHALL NOT accept a target `systemId` as client input.

### 3.2 Source and target resolution

#### FR-SCI-03: Source container lookup

The system SHALL locate the source container by `oldContainerNaturalId` within
the requested subgraph and active file scope. If either the subgraph or source
container does not exist in that scope, the endpoint SHALL return `404 Not
Found` and SHALL make no changes.

#### FR-SCI-04: Existing target container compatibility

When a target container with `newContainerNaturalId` already exists in the
active file scope, the system SHALL update the container ID of every module in
the requested subgraph that currently belongs to the source container only when
the target container's capability ID and processor ID both match those of the
source container.

If either value does not match, the endpoint SHALL return `422 Unprocessable
Entity` and SHALL make no changes.

#### FR-SCI-05: Create a missing target container

When no target container with `newContainerNaturalId` exists in the active file
scope, the system SHALL add a target container with that natural ID to the
system, resolve or assign its internal `systemId`, and update the container ID
of every module in the requested subgraph that currently belongs to the source
container.

### 3.3 Result semantics

#### FR-SCI-06: Replace all source-container module assignments

On success, the system SHALL replace the source container assignment for all
modules in the requested subgraph that belong to the source container. Modules
associated with other containers in the same subgraph SHALL remain unchanged.

#### FR-SCI-07: Idempotent identical-ID request

When `oldContainerNaturalId` and `newContainerNaturalId` are identical, the
system SHALL perform no database mutation and return `204 No Content`.

#### FR-SCI-08: Success response

After a successful replacement or the no-op case, the endpoint SHALL return
`204 No Content`.

### 3.4 Validation and atomicity

#### FR-SCI-09: Request validation

The system SHALL reject a request missing either natural ID or containing a
non-integer ID with `400 Bad Request`.

#### FR-SCI-10: Atomic update

The target lookup or creation and every affected module assignment update SHALL
complete atomically. On failure, no affected module assignment or target
container creation SHALL persist.

#### FR-SCI-11: Session enforcement

When no valid active session is present, the endpoint SHALL return `401
Unauthorized`.

---

## 4. Invariants

**I1 — Client-facing identity:** A client request for this endpoint never
depends on a persistence `systemId` for either container.

**I2 — Scoped replacement:** A successful request changes only modules in the
specified subgraph that are assigned to the source container.

**I3 — Compatible reuse:** An existing target container can be used only when
both its capability ID and processor ID match the source container.

**I4 — All-or-nothing:** A failed request leaves source assignments and target
container persistence unchanged.

---

## 5. Non-Functional Requirements

**NFR-SCI-01:** Standard transactional database performance is sufficient;
there is no additional latency or scale target for this endpoint.

---

## 6. Out of Scope

- Updating the existing `docs/property-data/design/property-write-api-design.md`.
- Moving individual modules independently of their source container.
- Replacing container assignments for modules belonging to other containers in
  the same subgraph.
- Accepting or exposing internally assigned container `systemId` values in the
  request body.
- Defining read APIs or changes to other property endpoints.

---

## 7. Open Questions

**OQ-SCI-01: Empty source container lifecycle.** After every affected module
has moved to the target container, should an empty source container be retained
or deleted? This requirement intentionally leaves that decision open.
