# Property System ID in Request Body: Requirements

**Date:** 2026-11-10  
**Status:** Frozen

## 1. Context

PR #191 currently identifies a generic container or subgraph property through a
URL path parameter while parameter updates carry their identifier in the request
body. The reviewed API contract must use the request body as the single source
of the property system ID for every endpoint that accepts `PropertySummaryDto`.

## 2. Functional Requirements

### FR-PSIB-01: Property request identity

Every `PropertySummaryDto` request body shall require a `systemId` in addition
to `elements`.

### FR-PSIB-02: Generic property routes

The generic container and subgraph property PUT routes shall no longer expose a
property-system-ID path parameter. They shall use the validated body `systemId`
as the target property ID. Parent container and subgraph IDs remain path
parameters.

### FR-PSIB-03: Dedicated scenario and VSID routes

The subgraph scenario and VSID PUT routes shall require `systemId` in the body
and reject the request when it does not identify the scenario or VSID property,
respectively, for that file context.

### FR-PSIB-04: VCPM calibration route

The VCPM CKV calibration-data PUT route shall require `systemId` in the body
and document it as the property/parameter identifier. Semantic validation that
the ID belongs to the addressed subgraph and CKV context is deferred until the
currently unimplemented VCPM write handler is implemented.

### FR-PSIB-05: Invalid identity response

Missing or malformed body `systemId` values, and unknown or context-mismatched
IDs on implemented property write endpoints, shall be rejected as client input
errors (HTTP 400). The request shall make no write.

### FR-PSIB-06: API contract and tests

Swagger documentation and API tests shall show `systemId` in the request body
and the revised generic property URLs.

## 3. Invariants

**I1 — Single source of truth:** A property write shall have exactly one
client-supplied property identifier: `PropertySummaryDto.systemId`. Generic
property URLs shall not duplicate it.

**I2 — Target safety:** A body system ID shall never cause a dedicated endpoint
to write a different property than the endpoint's declared target or context.

## 4. Non-Functional Requirements

**NFR-PSIB-01:** The change shall preserve CQRS boundaries: controllers map the
validated HTTP contract to commands, while command handlers perform
context-specific target validation and own transaction decisions.

## 5. Out of Scope

- Changing parent project, container, subgraph, or CKV identifiers from path
  parameters to the request body.
- Adding batch property-write endpoints.
- Changing property element serialization or persistence semantics.
- Implementing the VCPM CKV calibration-data write handler or its semantic
  `systemId` validation.
