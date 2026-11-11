# Property System ID in Request Body: Design

**Requirements:** [../requirements/property-system-id-request-body-requirements.md](../requirements/property-system-id-request-body-requirements.md)  
**Date:** 2026-11-10  
**Status:** Approved design

## 1. Contract

Every endpoint that accepts `PropertySummaryDto` receives the property identity
in the body:

```json
{
  "systemId": "123",
  "elements": []
}
```

The property system ID remains a decimal string on the HTTP contract, matching
the existing parameter-summary convention. The API adapter validates and
converts it to a safe integer before constructing commands that require a
numeric system ID.

The generic property-write routes become:

```text
PUT /containers/:containerSystemId/properties
PUT /subgraphs/:subgraphSystemId/properties
```

The container/subgraph IDs remain path parameters. The removed property-ID path
parameters are not supported by the revised contract.

Dedicated subgraph scenario, VSID, and VCPM-calibration routes retain their
current URLs but require `systemId` in the body.

## 2. DTO and HTTP Validation

### 2.1 Core contract

`packages/core/src/application/usecase-designer/spf-module/dto/parameter-dto.ts`
will define `PropertySummaryDtoSchema` as the `elements` base schema extended
with `systemId: z.string()`. `ParameterSummaryDtoSchema` and
`PropertySummaryDtoSchema` therefore share the same request identity shape
without making either API DTO class inherit from the other.

### 2.2 API DTO

`packages/api/src/presentation/rest/common/dto/property-summary.dto.ts` will
use `PropertySummaryDtoSchema`, declare `systemId` for Swagger, and decorate it
with class-validator metadata for a non-empty decimal identifier. `elements`
retains `@IsArray()`.

This is required because the current global Nest `ValidationPipe` uses
class-validator metadata with `whitelist` and `forbidNonWhitelisted`; the Zod
schema attached by `createZodDto` is not the active request-validation pipe.

### 2.3 Conversion boundary

A small API-layer helper will convert the already validated decimal string to a
non-negative safe integer. It throws `BadRequestException` for a value that
cannot be represented safely. Controllers use this helper before creating
commands that accept numeric property IDs. Core remains free of NestJS and HTTP
validation concerns.

## 3. Controller and Command Flow

### 3.1 Generic property replacement

The container and subgraph controllers remove the property-ID `@ApiParam` and
`@Param` arguments. They use the converted `dto.systemId` when constructing
their existing `SetContainerPropertyCommand` and `SetSubgraphPropertyCommand`.
The handlers already validate that the resulting property definition exists and
belongs to the relevant write context.

### 3.2 Scenario and VSID

`SetSubgraphScenarioCommand` and `SetSubgraphVsidCommand` gain a numeric
`propertySystemId`. Their controllers pass the converted body value.

Each handler already resolves its expected property definition by natural ID.
Immediately after that lookup, it compares the resolved definition system ID
with `command.propertySystemId`. A mismatch raises `InvalidInputException`
(HTTP 400) before serialization, cascade work, transaction start, or writes.

### 3.3 VCPM calibration

The subgraph VCPM-calibration controller accepts the revised DTO and exposes
`systemId` in Swagger. It continues passing the DTO in the command data, so the
future handler can validate the property/parameter against its subgraph and CKV
context.

`UpdateVcpmCalDataHandler` is currently unimplemented. This change does not
implement it or claim semantic context validation for this endpoint; it only
establishes the required request shape.

## 4. Error Handling

| Condition | Response | Write behaviour |
|---|---:|---|
| Missing/non-decimal/unsafe body `systemId` | 400 | No command write |
| Generic property ID not found | Existing 404 | No write |
| Scenario/VSID body ID does not match resolved target | 400 | No write |
| VCPM context mismatch | Deferred with its unimplemented handler | No new behaviour |

The dedicated-route comparison is handler-owned so it is enforced for every
command-bus caller, not only HTTP requests.

## 5. Verification

- Update API DTO/controller tests and Swagger generation assertions for the new
  generic URLs and required body `systemId`.
- Extend container and subgraph property E2E tests to send the property ID only
  in the body; cover missing or invalid IDs returning 400.
- Add scenario and VSID handler tests proving a mismatched body ID returns 400
  before a transaction or repository write.
- Run affected core unit tests, API E2E tests, API build, and Swagger generation.

## 6. Scope Boundaries

No persistence schemas, migrations, property serialization, parent-resource
path parameters, or batch property-write behaviour change. VCPM write-handler
implementation and semantic target validation remain separate work.
