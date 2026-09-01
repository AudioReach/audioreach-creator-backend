# Get TKV Tag Data Implementation Plan

> **For agentic workers:** Use the executing-plans skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `GET /:spfModuleSystemId/tag-data/:tagSystemId/:tkvSystemId` — returning the overlay-aware key-value pairs and decoded binary parameter payloads for a single TKV bin.

**Architecture:** CQRS query path — controller dispatches `GetTkvCalibrationDataQuery`, handled by `GetTkvCalibrationDataHandler` which calls the new `TkvQueryService` port, backed by `DbTkvCalibrationQueryService` (infra) which delegates to `TkvOverlayFetcher` for session overlay. The handler is structurally identical to `GetCkvCalibrationDataHandler`; the only differences are the extra `tagSystemId` scoping and TKV-specific types.

**Tech Stack:** NestJS, TypeORM, SQLite, Zod, Jest, `@arc/core` / `@arc/api` / `@arc/persistence` monorepo packages.

---

### Task 1: TkvQueryService port interface

**Package:** `@arc/core`

**Files:**
- Create: `packages/core/src/application/ports/persistence/query-services/spf-module/tkv/tkv-query-service.ts`
- Modify: `packages/core/src/application/ports/persistence/query-services/spf-module/spf-module-query-service.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Create TkvQueryService interface**

```typescript
// packages/core/src/application/ports/persistence/query-services/spf-module/tkv/tkv-query-service.ts
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {TkvReadModel} from '../tuning/tuning-config-read-model.js';
import type {ParameterPayloadReadModel} from '../ckv/ckv-read-model.js';

export interface TkvQueryService {
  /**
   * Returns the TKV row with its key-value pairs.
   * Scoped to moduleTagIdMapSystemId — returns null if the TKV does not exist
   * under that tag map, or if it was deleted in the active session.
   */
  getTkv(
    fileSystemId: number,
    moduleSystemId: number,
    moduleTagIdMapSystemId: number,
    tkvSystemId: number,
  ): Promise<TkvReadModel | null>;

  /**
   * Returns tkv_parameter_payload rows for the given TKV, session-overlaid.
   * When paramSystemIds is non-empty, filters to those payload PKs only.
   * When empty, returns all payloads under the TKV.
   */
  getTkvPayloads(
    fileSystemId: number,
    moduleSystemId: number,
    tkvSystemId: number,
    paramSystemIds?: number[],
  ): Promise<ParameterPayloadReadModel[]>;
}
```

- [ ] **Step 2: Add `tkvQueryService` to SpfModuleQueryService**

In `packages/core/src/application/ports/persistence/query-services/spf-module/spf-module-query-service.ts`, add the import and the property:

```typescript
import type {TkvQueryService} from './tkv/tkv-query-service.js';

export interface SpfModuleQueryService {
  readonly ckvQueryService: CkvQueryService;
  readonly tkvQueryService: TkvQueryService;   // ← add this line
  // ... all existing methods unchanged
```

- [ ] **Step 3: Export TkvQueryService from core barrel**

In `packages/core/src/index.ts`, add after the existing CKV export lines (around line 116):

```typescript
export * from './application/ports/persistence/query-services/spf-module/tkv/tkv-query-service.js';
```

- [ ] **Step 4: Build to verify**

Run: `pnpm --filter @arc/core run build`
Expected: PASS with no TypeScript errors. (`DbSpfModuleQueryService` will fail to compile until Task 7 adds `tkvQueryService` — that is expected and will be fixed in Task 7.)

---

### Task 2: TkvCalibrationReadModel + mapTkvCalDataDto

**Package:** `@arc/core`

**Files:**
- Create: `packages/core/src/application/usecase-designer/spf-module/get-tag-data/tkv-calibration-read-model.ts`
- Modify: `packages/core/src/application/usecase-designer/spf-module/get-tag-data/tkv-cal-data-dto.ts`
- Test: `packages/core/tests/unit/application/usecase-designer/spf-module/get-tag-data/tkv-cal-data-dto.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/unit/application/usecase-designer/spf-module/get-tag-data/tkv-cal-data-dto.spec.ts
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {describe, it, expect} from '@jest/globals';
import {mapTkvCalDataDto, TkvCalDataDtoSchema} from '../../../../../../src/application/usecase-designer/spf-module/get-tag-data/tkv-cal-data-dto.js';
import type {TkvReadModel} from '../../../../../../src/application/ports/persistence/query-services/spf-module/tuning/tuning-config-read-model.js';
import type {ParameterCalibrationReadModel} from '../../../../../../src/application/usecase-designer/spf-module/get-tag-data/tkv-calibration-read-model.js';
import {PARAMETER_ELEMENT_TYPE} from '../../../../../../src/application/usecase-designer/shared/element-definition.js';

const mockTkv: TkvReadModel = {
  systemId: 10,
  moduleTagIdMapSystemId: 5,
  keyValuePairs: [
    {
      key: {keyId: 1, name: 'ch', systemId: 100},
      value: {valueId: 2, name: 'stereo', systemId: 200},
    },
  ],
};

const mockParam: ParameterCalibrationReadModel = {
  systemId: 20,
  parameterId: 42,
  name: 'gain',
  description: 'Gain param',
  isReadOnly: false,
  isHidden: undefined,
  pidType: 'PARAM_ID_GAIN' as any,
  parsedData: [
    {
      elementType: PARAMETER_ELEMENT_TYPE.ConfigElement,
      name: 'gain',
      dataType: 'UInt32',
      isReadOnly: false,
      value: 5,
    },
  ],
};

describe('mapTkvCalDataDto', () => {
  it('maps TkvReadModel + parameters to TkvCalDataDto', () => {
    const dto = mapTkvCalDataDto(mockTkv, [mockParam]);
    expect(dto.systemId).toBe('10');
    expect(dto.Tkv).toHaveLength(1);
    expect(dto.Tkv[0].key.keyId).toBe(1);
    expect(dto.Tkv[0].key.name).toBe('ch');
    expect(dto.Tkv[0].value.name).toBe('stereo');
    expect(dto.parameters).toHaveLength(1);
    expect(dto.parameters[0].name).toBe('gain');
  });

  it('returns empty Tkv array when keyValuePairs is empty', () => {
    const dto = mapTkvCalDataDto({...mockTkv, keyValuePairs: []}, []);
    expect(dto.Tkv).toHaveLength(0);
    expect(dto.parameters).toHaveLength(0);
  });

  it('serialises systemId as string', () => {
    const dto = mapTkvCalDataDto(mockTkv, []);
    expect(typeof dto.systemId).toBe('string');
    expect(dto.systemId).toBe('10');
  });

  it('produces output that passes TkvCalDataDtoSchema validation', () => {
    const dto = mapTkvCalDataDto(mockTkv, [mockParam]);
    const result = TkvCalDataDtoSchema.safeParse(dto);
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @arc/core run test:core -- --testPathPattern="tkv-cal-data-dto.spec"`
Expected: FAIL — `mapTkvCalDataDto` is not exported from `tkv-cal-data-dto.ts`

- [ ] **Step 3: Create TkvCalibrationReadModel**

```typescript
// packages/core/src/application/usecase-designer/spf-module/get-tag-data/tkv-calibration-read-model.ts
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {ParameterCalibrationReadModel} from '../get-cal-data/ckv-calibration-read-model.js';
import type {TkvReadModel} from '../../../ports/persistence/query-services/spf-module/tuning/tuning-config-read-model.js';

export type {ParameterCalibrationReadModel};

export interface TkvCalibrationReadModel {
  tkv: TkvReadModel;
  parameters: ParameterCalibrationReadModel[];
}
```

- [ ] **Step 4: Add mapTkvCalDataDto to tkv-cal-data-dto.ts**

`tkv-cal-data-dto.ts` currently exports only `TkvCalDataDtoSchema` and `TkvCalDataDto`. Add the following imports and function at the bottom of the file:

```typescript
import {mapParameterCalibrationToDto} from '../get-cal-data/ckv-cal-data-dto.js';
import type {ParameterCalibrationReadModel} from './tkv-calibration-read-model.js';
import type {TkvReadModel} from '../../../ports/persistence/query-services/spf-module/tuning/tuning-config-read-model.js';

export function mapTkvCalDataDto(
  tkv: TkvReadModel,
  parameters: ParameterCalibrationReadModel[],
): TkvCalDataDto {
  return {
    systemId: tkv.systemId.toString(),
    Tkv: (tkv.keyValuePairs ?? []).map(kv => ({
      key: {
        keyId: kv.key.keyId,
        name: kv.key.name,
        systemId: String(kv.key.systemId),
      },
      value: {
        valueId: kv.value.valueId,
        name: kv.value.name,
        systemId: String(kv.value.systemId),
      },
    })),
    parameters: parameters.map(p => mapParameterCalibrationToDto(p)),
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @arc/core run test:core -- --testPathPattern="tkv-cal-data-dto.spec"`
Expected: PASS — all 4 assertions pass

---

### Task 3: GetTkvCalibrationDataQuery

**Package:** `@arc/core`

**Files:**
- Create: `packages/core/src/application/usecase-designer/spf-module/get-tag-data/get-tkv-cal-data.query.ts`
- Test: `packages/core/tests/unit/application/usecase-designer/spf-module/get-tag-data/get-tkv-cal-data.query.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/unit/application/usecase-designer/spf-module/get-tag-data/get-tkv-cal-data.query.spec.ts
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {describe, it, expect} from '@jest/globals';
import {GetTkvCalibrationDataQuery} from '../../../../../../src/application/usecase-designer/spf-module/get-tag-data/get-tkv-cal-data.query.js';
import {InvalidOperationException} from '../../../../../../src/shared/exceptions/invalid-operation.exception.js';

describe('GetTkvCalibrationDataQuery', () => {
  it('parses all decimal IDs correctly', () => {
    const q = new GetTkvCalibrationDataQuery('1', '2', '3', '4', 'client');
    expect(q.projectId).toBe(1);
    expect(q.spfModuleSystemId).toBe(2);
    expect(q.tagSystemId).toBe(3);
    expect(q.tkvSystemId).toBe(4);
    expect(q.paramSystemIds).toHaveLength(0);
  });

  it('parses hex IDs (0x prefix)', () => {
    const q = new GetTkvCalibrationDataQuery('0x1', '0x2', '0x3', '0x4', 'c');
    expect(q.projectId).toBe(1);
    expect(q.tagSystemId).toBe(3);
    expect(q.tkvSystemId).toBe(4);
  });

  it('parses comma-separated paramSystemIds', () => {
    const q = new GetTkvCalibrationDataQuery('1', '2', '3', '4', 'c', '10,20,0x1e');
    expect(q.paramSystemIds).toEqual([10, 20, 30]);
  });

  it('returns empty paramSystemIds when not provided', () => {
    const q = new GetTkvCalibrationDataQuery('1', '2', '3', '4', 'c');
    expect(q.paramSystemIds).toEqual([]);
  });

  it('throws InvalidOperationException for non-numeric tagSystemId', () => {
    expect(
      () => new GetTkvCalibrationDataQuery('1', '2', 'abc', '4', 'c'),
    ).toThrow(InvalidOperationException);
  });

  it('throws InvalidOperationException for non-numeric tkvSystemId', () => {
    expect(
      () => new GetTkvCalibrationDataQuery('1', '2', '3', 'xyz', 'c'),
    ).toThrow(InvalidOperationException);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @arc/core run test:core -- --testPathPattern="get-tkv-cal-data.query.spec"`
Expected: FAIL — module not found

- [ ] **Step 3: Create GetTkvCalibrationDataQuery**

```typescript
// packages/core/src/application/usecase-designer/spf-module/get-tag-data/get-tkv-cal-data.query.ts
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {BaseQuery} from '../../../shared/base-query.js';
import {InvalidOperationException} from '../../../../shared/exceptions/invalid-operation.exception.js';

function parseId(value: string, paramName: string): number {
  const trimmed = value.trim();
  const num =
    trimmed.startsWith('0x') || trimmed.startsWith('0X')
      ? Number.parseInt(trimmed, 16)
      : Number.parseInt(trimmed, 10);
  if (Number.isNaN(num)) {
    throw new InvalidOperationException(
      `Invalid ${paramName}: "${value}" is not a valid integer or hex value`,
    );
  }
  return num;
}

/**
 * Query to retrieve tag data for a specific TKV (Tag Key-Value) bin
 * belonging to an SPF module, scoped to a moduleTagIdMap entry (tagSystemId).
 *
 * All ID parameters are accepted as raw strings (as received from the HTTP layer)
 * and parsed to integers in the constructor. Decimal and hexadecimal (0x prefix)
 * notation are both supported. Throws `InvalidOperationException` if any value
 * cannot be parsed — the global exception filter maps this to HTTP 400.
 */
export class GetTkvCalibrationDataQuery extends BaseQuery {
  public readonly projectId: number;
  public readonly spfModuleSystemId: number;
  /** moduleTagIdMapSystemId — PK of the module_tag_id_map row that owns this TKV. */
  public readonly tagSystemId: number;
  public readonly tkvSystemId: number;
  /** PKs of tkv_parameter_payload rows to return. Empty = all payloads. */
  public readonly paramSystemIds: number[];

  constructor(
    projectIdStr: string,
    spfModuleSystemIdStr: string,
    tagSystemIdStr: string,
    tkvSystemIdStr: string,
    clientId: string,
    paramSystemIdsStr?: string,
  ) {
    super(clientId);
    this.projectId          = parseId(projectIdStr, 'projectId');
    this.spfModuleSystemId  = parseId(spfModuleSystemIdStr, 'spfModuleSystemId');
    this.tagSystemId        = parseId(tagSystemIdStr, 'tagSystemId');
    this.tkvSystemId        = parseId(tkvSystemIdStr, 'tkvSystemId');
    this.paramSystemIds     = paramSystemIdsStr
      ? paramSystemIdsStr.split(',').map(id => parseId(id.trim(), 'param-system-ids'))
      : [];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @arc/core run test:core -- --testPathPattern="get-tkv-cal-data.query.spec"`
Expected: PASS — all 6 assertions pass

---

### Task 4: GetTkvCalibrationDataHandler

**Package:** `@arc/core`

**Files:**
- Create: `packages/core/src/application/usecase-designer/spf-module/get-tag-data/get-tkv-cal-data.handler.ts`
- Test: `packages/core/tests/unit/application/usecase-designer/spf-module/get-tag-data/get-tkv-cal-data.handler.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/unit/application/usecase-designer/spf-module/get-tag-data/get-tkv-cal-data.handler.spec.ts
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {jest} from '@jest/globals';
import {describe, it, expect} from '@jest/globals';
import {GetTkvCalibrationDataHandler} from '../../../../../../src/application/usecase-designer/spf-module/get-tag-data/get-tkv-cal-data.handler.js';
import {GetTkvCalibrationDataQuery} from '../../../../../../src/application/usecase-designer/spf-module/get-tag-data/get-tkv-cal-data.query.js';
import {TkvCalDataDtoSchema} from '../../../../../../src/application/usecase-designer/spf-module/get-tag-data/tkv-cal-data-dto.js';
import type {QueryServices} from '../../../../../../src/application/ports/persistence/query-services/query-services.js';
import type {ParameterPayloadReadModel} from '../../../../../../src/application/ports/persistence/query-services/spf-module/ckv/ckv-read-model.js';
import type {TkvReadModel} from '../../../../../../src/application/ports/persistence/query-services/spf-module/tuning/tuning-config-read-model.js';
import type {ParameterDefinitionReadModel} from '../../../../../../src/application/ports/persistence/query-services/shared/parameter-definition-read-model.js';
import {PARAMETER_ELEMENT_TYPE} from '../../../../../../src/application/usecase-designer/shared/element-definition.js';
import {
  NullPayloadError,
  ParameterDefinitionMissingError,
} from '../../../../../../src/shared/errors/parameter.errors.js';
import {ResourceNotFoundException} from '../../../../../../src/shared/exceptions/resource-not-found.exception.js';
import {Result, RESULT_KIND} from '../../../../../../src/application/shared/result/result.js';

const mockTkv: TkvReadModel = {
  systemId: 10,
  moduleTagIdMapSystemId: 3,
  keyValuePairs: [],
};

const mockPayload: ParameterPayloadReadModel = {
  systemId: 20,
  parameterSystemId: 100,
  payload: new Uint8Array([0x05, 0x00, 0x00, 0x00]),
};

const mockDef: ParameterDefinitionReadModel = {
  systemId: 100,
  paramId: 42,
  name: 'gain',
  elementsStructure: JSON.stringify([
    {elementType: 'ConfigElement', name: 'gain', dataType: 'UInt32', isReadOnly: false},
  ]),
  isReadOnly: false,
  pidType: 'PARAM_ID_GAIN',
};

function makeServices(
  overrides: {
    fileId?: number;
    moduleDefId?: number;
    tkv?: TkvReadModel | null;
    payloads?: ParameterPayloadReadModel[];
    defs?: ParameterDefinitionReadModel[];
  } = {},
): QueryServices {
  const {
    fileId = 5,
    moduleDefId = 50,
    tkv = mockTkv,
    payloads = [mockPayload],
    defs = [mockDef],
  } = overrides;
  return {
    projectQueryService: {
      getFileIdByProjectId: jest.fn().mockResolvedValue(fileId),
    },
    spfModuleQueryService: {
      getSpfModule: jest.fn().mockResolvedValue(Result.ok({definitionSystemId: moduleDefId})),
      tkvQueryService: {
        getTkv: jest.fn().mockResolvedValue(tkv),
        getTkvPayloads: jest.fn().mockResolvedValue(payloads),
      },
    },
    spfModuleDefinitionQueryService: {
      queryParameterDefinitions: jest.fn().mockResolvedValue(defs),
    },
    modulesQueryService: {} as any,
    useCaseQueryService: {} as any,
    validationQueryService: {} as any,
  } as unknown as QueryServices;
}

function makeQuery(overrides: {paramSystemIds?: string} = {}): GetTkvCalibrationDataQuery {
  return new GetTkvCalibrationDataQuery('1', '2', '3', '10', 'client-id', overrides.paramSystemIds);
}

describe('GetTkvCalibrationDataHandler', () => {
  it('returns Result<TkvCalDataDto> with parsed parameters', async () => {
    const handler = new GetTkvCalibrationDataHandler(makeServices());
    const result = await handler.handle(makeQuery());
    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data.systemId).toBe('10');
    expect(result.data.parameters).toHaveLength(1);
    expect(result.data.parameters[0].name).toBe('gain');
    expect(result.data.parameters[0].elements[0]).toMatchObject({type: 'ConfigElement', name: 'gain', value: '5'});
    expect(TkvCalDataDtoSchema.safeParse(result.data).success).toBe(true);
  });

  it('passes tagSystemId to getTkv', async () => {
    const services = makeServices();
    const handler = new GetTkvCalibrationDataHandler(services);
    await handler.handle(makeQuery());
    const getTkv = (services.spfModuleQueryService as any).tkvQueryService.getTkv as jest.Mock;
    expect(getTkv).toHaveBeenCalledWith(
      expect.any(Number),  // fileSystemId
      expect.any(Number),  // moduleSystemId
      3,                   // tagSystemId (from query)
      10,                  // tkvSystemId
    );
  });

  it('throws ResourceNotFoundException when TKV not found', async () => {
    const handler = new GetTkvCalibrationDataHandler(makeServices({tkv: null}));
    await expect(handler.handle(makeQuery())).rejects.toThrow(ResourceNotFoundException);
  });

  it('throws NullPayloadError when payload is null', async () => {
    const handler = new GetTkvCalibrationDataHandler(
      makeServices({payloads: [{...mockPayload, payload: null}]}),
    );
    await expect(handler.handle(makeQuery())).rejects.toThrow(NullPayloadError);
  });

  it('throws ParameterDefinitionMissingError when definition is absent', async () => {
    const handler = new GetTkvCalibrationDataHandler(makeServices({defs: []}));
    await expect(handler.handle(makeQuery())).rejects.toThrow(ParameterDefinitionMissingError);
  });

  it('joins payloads to definitions by parameterSystemId → systemId', async () => {
    const handler = new GetTkvCalibrationDataHandler(makeServices());
    const result = await handler.handle(makeQuery());
    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data.parameters[0].parameterId).toBe('42');
  });

  it('returns Result.partial when requested paramSystemIds are missing from payloads', async () => {
    const handler = new GetTkvCalibrationDataHandler(makeServices());
    // paramSystemId 999 doesn't exist in mockPayload (systemId=20)
    const result = await handler.handle(makeQuery({paramSystemIds: '20,999'}));
    expect(result.kind).toBe(RESULT_KIND.Partial);
    if (result.kind !== RESULT_KIND.Partial) return;
    expect(result.issues.some(i => i.message.includes('999'))).toBe(true);
  });

  it('throws ResourceNotFoundException when getSpfModule returns Result.fail', async () => {
    const services = makeServices();
    (services.spfModuleQueryService.getSpfModule as jest.Mock).mockResolvedValue(
      Result.fail({code: 'ERR_4004', message: 'not found', severity: 'ERROR'}),
    );
    const handler = new GetTkvCalibrationDataHandler(services);
    await expect(handler.handle(makeQuery())).rejects.toThrow(ResourceNotFoundException);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @arc/core run test:core -- --testPathPattern="get-tkv-cal-data.handler.spec"`
Expected: FAIL — module not found for `get-tkv-cal-data.handler.js`

- [ ] **Step 3: Create GetTkvCalibrationDataHandler**

```typescript
// packages/core/src/application/usecase-designer/spf-module/get-tag-data/get-tkv-cal-data.handler.ts
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {GetTkvCalibrationDataQuery} from './get-tkv-cal-data.query.js';
import type {ParameterCalibrationReadModel} from './tkv-calibration-read-model.js';
import type {ParameterPayloadReadModel} from '../../../ports/persistence/query-services/spf-module/ckv/ckv-read-model.js';
import type {ParameterDefinitionReadModel} from '../../../ports/persistence/query-services/shared/parameter-definition-read-model.js';
import {parseParameterData} from '../../shared/parse-elements.js';
import type {ElementData} from '../../../../domain/entities/definitions/common/types/element-data.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/resource-not-found.exception.js';
import {NullPayloadError, ParameterDefinitionMissingError} from '../../../../shared/errors/parameter.errors.js';
import type {Logger} from '../../../../shared/types/logger.interface.js';
import {Result, RESULT_KIND} from '../../../shared/result/result.js';
import {ISSUE_CODE} from '../../../../shared/issues/operational-codes.js';
import {IssueSeverity} from '../../../../shared/issues/severity.js';
import type {TkvCalDataDto} from './tkv-cal-data-dto.js';
import {mapTkvCalDataDto} from './tkv-cal-data-dto.js';
import type {ParamType} from '../../../../domain/entities/definitions/common/types/param-type.js';

export class GetTkvCalibrationDataHandler implements QueryHandler<
  GetTkvCalibrationDataQuery,
  Promise<Result<TkvCalDataDto>>
> {
  constructor(
    private readonly queryServices: QueryServices,
    private readonly logger?: Logger,
  ) {}

  async handle(query: GetTkvCalibrationDataQuery): Promise<Result<TkvCalDataDto>> {
    const fileSystemId = await this.queryServices.projectQueryService
      .getFileIdByProjectId(query.projectId);

    const spfModuleResult = await this.queryServices.spfModuleQueryService
      .getSpfModule(query.spfModuleSystemId, fileSystemId);
    if (spfModuleResult.kind === RESULT_KIND.Fail) {
      throw new ResourceNotFoundException(
        `SpfModule ${query.spfModuleSystemId} not found`,
        spfModuleResult.issues,
      );
    }
    const spfModule = spfModuleResult.data;

    const [tkv, payloads] = await Promise.all([
      this.queryServices.spfModuleQueryService.tkvQueryService.getTkv(
        fileSystemId,
        query.spfModuleSystemId,
        query.tagSystemId,
        query.tkvSystemId,
      ),
      this.queryServices.spfModuleQueryService.tkvQueryService.getTkvPayloads(
        fileSystemId,
        query.spfModuleSystemId,
        query.tkvSystemId,
        query.paramSystemIds,
      ),
    ]);

    const relevantParamSystemIds = payloads.map(
      (p: ParameterPayloadReadModel) => p.parameterSystemId,
    );
    const parameterDefinitions = await this.queryServices.spfModuleDefinitionQueryService
      .queryParameterDefinitions(fileSystemId, spfModule.definitionSystemId, relevantParamSystemIds);

    if (!tkv) {
      throw new ResourceNotFoundException(
        `Tkv with systemId ${query.tkvSystemId} not found`,
      );
    }

    const missingParamSystemIds =
      query.paramSystemIds.length > 0
        ? (() => {
            const returnedIds = new Set(
              payloads.map((p: ParameterPayloadReadModel) => p.systemId),
            );
            return query.paramSystemIds.filter(id => !returnedIds.has(id));
          })()
        : undefined;

    const parameters = this.buildParameterDataModels(payloads, parameterDefinitions);
    const dto = mapTkvCalDataDto(tkv, parameters);

    if (missingParamSystemIds && missingParamSystemIds.length > 0) {
      const issues = missingParamSystemIds.map(id => ({
        code: ISSUE_CODE.PARAM_PAYLOAD_NOT_FOUND,
        message: `No tag data payload found for parameter system ID ${id}`,
        severity: IssueSeverity.Error,
      }));
      return Result.partial(dto, issues);
    }

    return Result.ok(dto);
  }

  private buildParameterDataModels(
    payloads: ParameterPayloadReadModel[],
    definitions: ParameterDefinitionReadModel[],
  ): ParameterCalibrationReadModel[] {
    const defMap = new Map(definitions.map(d => [d.systemId, d]));
    return payloads.map(p => {
      if (p.payload === null) throw new NullPayloadError(p.parameterSystemId);
      const def = defMap.get(p.parameterSystemId);
      if (def === undefined) throw new ParameterDefinitionMissingError(p.parameterSystemId);
      const parsedData: ElementData[] = parseParameterData(
        p.payload,
        def.elementsStructure ?? '',
        this.logger,
      );
      return {
        systemId: p.systemId,
        parameterId: def.paramId,
        name: def.name ?? String(def.paramId),
        description: def.description,
        isReadOnly: def.isReadOnly ?? false,
        isHidden: undefined,
        pidType: def.pidType as ParamType,
        parsedData,
      };
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @arc/core run test:core -- --testPathPattern="get-tkv-cal-data.handler.spec"`
Expected: PASS — all 8 assertions pass

---

### Task 5: TkvOverlayFetcher.fetchTkv

**Package:** `@arc/persistence`

**Files:**
- Modify: `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/fetchers/tkv-overlay-fetcher.ts`
- Test: `packages/infrastructure/persistence/tests/integration/fetchers/tkv-overlay-fetcher-fetch-tkv.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/infrastructure/persistence/tests/integration/fetchers/tkv-overlay-fetcher-fetch-tkv.spec.ts`:

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {DataSource} from 'typeorm';
import {CHANGE_OPERATION, CHANGE_STATUS, SOURCE} from '@arc/core';
import {
  SESSION_MODE,
  SESSION_STATUS,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestDataSource,
  getTestRepository,
} from '../helpers/test-database-setup.js';
import {EditActionsQueryService} from '../../../src/persistence-typeorm-sqllite/queries/edit-session/edit-actions-query-service.js';
import {TkvOverlayFetcher} from '../../../src/persistence-typeorm-sqllite/fetchers/tkv-overlay-fetcher.js';
import {ENTITY_NAMES} from '../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {ProjectSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {ArcDbFileSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {ProjectSessionSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {describe, it, expect, beforeAll, afterAll, beforeEach, afterEach} from '@jest/globals';

const FILE_ID = 200;
const MODULE_ID = 60;
const TAG_MAP_ID = 70;
const TKV_ID = 80;
const TAG_DEF_ID = 90;
const DEF_SYSTEM_ID = 300;

async function seedBase(ds: DataSource) {
  await getTestRepository(ProjectSchema).save({systemId: 1, name: 'P', description: '', type: 'Offline'});
  await getTestRepository(ArcDbFileSchema).save({
    systemId: FILE_ID, projectSystemId: 1, fileName: 'f.acdb',
    description: '', metadata: '{}', isTarget: true, lastReservedId: 0,
  });
  // Minimal processor_definition + subgraph + container + spf_module
  await ds.query(
    `INSERT OR IGNORE INTO processor_definitions (system_id, processor_definition_id, name, file_system_id) VALUES (1, 1, 'proc', ${FILE_ID})`,
  );
  await ds.query(
    `INSERT INTO subgraphs (system_id, name, subgraph_id, is_imported, file_system_id) VALUES (1, 'sg', 1, 0, ${FILE_ID})`,
  );
  await ds.query(
    `INSERT INTO containers (system_id, container_id, file_system_id) VALUES (1, 1, ${FILE_ID})`,
  );
  await ds.query(
    `INSERT INTO nodes (system_id, instance_id, subgraph_system_id, container_system_id, file_system_id) VALUES (${MODULE_ID}, 1, 1, 1, ${FILE_ID})`,
  );
  await ds.query(
    `INSERT OR IGNORE INTO spf_module_definitions (system_id, module_definition_id, name, file_system_id) VALUES (${DEF_SYSTEM_ID}, 1, 'mod', ${FILE_ID})`,
  );
  await ds.query(
    `INSERT INTO spf_modules (system_id, definition_system_id) VALUES (${MODULE_ID}, ${DEF_SYSTEM_ID})`,
  );
  // tag_definition row
  await ds.query(
    `INSERT INTO tag_definitions (system_id, tag_id, name, is_voice, file_system_id) VALUES (${TAG_DEF_ID}, 1, 'ch', 0, ${FILE_ID})`,
  );
  // module_tag_id_map row
  await ds.query(
    `INSERT INTO module_tag_id_map (system_id, spf_module_system_id, tag_definition_system_id) VALUES (${TAG_MAP_ID}, ${MODULE_ID}, ${TAG_DEF_ID})`,
  );
  // tkv row
  await ds.query(
    `INSERT INTO tkv (system_id, module_tag_id_map_system_id) VALUES (${TKV_ID}, ${TAG_MAP_ID})`,
  );
}

async function seedSession(ds: DataSource): Promise<number> {
  const row = await getTestRepository(ProjectSessionSchema).save({
    fileSystemId: FILE_ID, userId: 'u', clientId: 'c',
    sessionMode: SESSION_MODE.Designer, status: SESSION_STATUS.Active, endedAt: null,
  });
  return row.sessionId;
}

function makeFetcher(ds: DataSource): TkvOverlayFetcher {
  return new TkvOverlayFetcher(ds.manager, new EditActionsQueryService(ds.manager));
}

describe('TkvOverlayFetcher.fetchTkv', () => {
  beforeAll(setupIntegrationTest);
  afterAll(teardownIntegrationTest);
  beforeEach(setupEachTest);

  it('Tier 1 — returns OverlaidTkv when TKV exists and no session', async () => {
    const ds = getTestDataSource();
    await seedBase(ds);
    const fetcher = makeFetcher(ds);
    const result = await fetcher.fetchTkv(TKV_ID, TAG_MAP_ID, null);
    expect(result).not.toBeNull();
    expect(result?.systemId).toBe(TKV_ID);
    expect(result?.moduleTagIdMapSystemId).toBe(TAG_MAP_ID);
  });

  it('Tier 1 — returns null when tkvSystemId not found', async () => {
    const ds = getTestDataSource();
    await seedBase(ds);
    const fetcher = makeFetcher(ds);
    expect(await fetcher.fetchTkv(9999, TAG_MAP_ID, null)).toBeNull();
  });

  it('Tier 1 — returns null when moduleTagIdMapSystemId does not match', async () => {
    const ds = getTestDataSource();
    await seedBase(ds);
    const fetcher = makeFetcher(ds);
    // TKV_ID exists but under TAG_MAP_ID, not 9999
    expect(await fetcher.fetchTkv(TKV_ID, 9999, null)).toBeNull();
  });

  it('Tier 3 — returns null for DELETE edit_action', async () => {
    const ds = getTestDataSource();
    await seedBase(ds);
    const sessionId = await seedSession(ds);
    await ds.getRepository(ENTITY_NAMES.EditAction).save({
      sessionId, tableName: ENTITY_NAMES.Tkv, aggregateId: TAG_MAP_ID,
      targetSystemId: TKV_ID, operation: CHANGE_OPERATION.Delete,
      status: CHANGE_STATUS.Pending, source: SOURCE.Manual, newValue: null,
    });
    const fetcher = makeFetcher(ds);
    expect(await fetcher.fetchTkv(TKV_ID, TAG_MAP_ID, sessionId)).toBeNull();
  });

  it('Tier 3 — returns synthesised row for CREATE edit_action (not in DB)', async () => {
    const ds = getTestDataSource();
    await seedBase(ds);
    const sessionId = await seedSession(ds);
    const newTkvId = 999;
    await ds.getRepository(ENTITY_NAMES.EditAction).save({
      sessionId, tableName: ENTITY_NAMES.Tkv, aggregateId: TAG_MAP_ID,
      targetSystemId: newTkvId, operation: CHANGE_OPERATION.Create,
      status: CHANGE_STATUS.Pending, source: SOURCE.Manual,
      newValue: {systemId: newTkvId, moduleTagIdMapSystemId: TAG_MAP_ID},
    });
    const fetcher = makeFetcher(ds);
    const result = await fetcher.fetchTkv(newTkvId, TAG_MAP_ID, sessionId);
    expect(result).not.toBeNull();
    expect(result?.systemId).toBe(newTkvId);
    expect(result?.moduleTagIdMapSystemId).toBe(TAG_MAP_ID);
    expect(result?.values).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @arc/persistence run test:persistence -- --testPathPattern="tkv-overlay-fetcher-fetch-tkv.spec"`
Expected: FAIL — `fetchTkv` method does not exist on `TkvOverlayFetcher`

- [ ] **Step 3: Add fetchTkv to TkvOverlayFetcher**

In `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/fetchers/tkv-overlay-fetcher.ts`, add after the `fetchTkvPayloads` method and before the `// ── Private helpers` comment. Also add `toOverlaidTkv` private helper after the `toOverlaidTagMap` helper:

```typescript
/**
 * Returns the overlaid Tkv row for the given tkvSystemId, scoped to
 * moduleTagIdMapSystemId (validates ownership).
 * Returns null if the row does not exist or was deleted in the active session.
 *
 * Overlay aggregateId = moduleTagIdMapSystemId (parent tag map's PK).
 */
async fetchTkv(
  tkvSystemId: number,
  moduleTagIdMapSystemId: number,
  sessionId: number | null,
): Promise<OverlaidTkv | null> {
  const baseRow = (await this.manager
    .getRepository(ENTITY_NAMES.Tkv)
    .createQueryBuilder('tkv')
    .leftJoinAndSelect('tkv.values', 'tkvValues')
    .where('tkv.systemId = :tkvSystemId', {tkvSystemId})
    .andWhere('tkv.moduleTagIdMapSystemId = :moduleTagIdMapSystemId', {moduleTagIdMapSystemId})
    .getOne()) as TkvRow | null;

  if (sessionId === null) {
    return baseRow ? this.toOverlaidTkv(baseRow) : null;
  }

  const tkvActions = await this.editActionsSvc.getByTable(sessionId, ENTITY_NAMES.Tkv);
  const relevantActions = tkvActions.filter(
    a => a.aggregateId === moduleTagIdMapSystemId &&
         (a.targetSystemId === tkvSystemId ||
          (a.newValue as {systemId?: number})?.systemId === tkvSystemId),
  );

  if (relevantActions.length === 0) {
    return baseRow ? this.toOverlaidTkv(baseRow) : null;
  }

  const deleteAction = relevantActions.find(
    a => a.operation === CHANGE_OPERATION.Delete && a.targetSystemId === tkvSystemId,
  );
  if (deleteAction) return null;

  if (baseRow) {
    const updateActions = relevantActions.filter(
      a => a.operation === CHANGE_OPERATION.Update && a.targetSystemId === tkvSystemId,
    );
    const overlaid = updateActions.length > 0
      ? (this.overlay.applyToCollection(
          [baseRow],
          updateActions,
        ) as Array<{effective: TkvRow}>)[0]?.effective ?? null
      : baseRow;
    return overlaid ? this.toOverlaidTkv(overlaid) : null;
  }

  const createAction = relevantActions.find(
    a => a.operation === CHANGE_OPERATION.Create && a.targetSystemId === tkvSystemId,
  );
  if (createAction) {
    const p = createAction.newValue as Partial<TkvBase>;
    return {
      systemId: tkvSystemId,
      moduleTagIdMapSystemId: p.moduleTagIdMapSystemId ?? moduleTagIdMapSystemId,
      uiPersistence: null,
      values: [],
    };
  }

  return null;
}
```

Add the private `toOverlaidTkv` helper at the bottom of the class (after `toOverlaidTagMap`):

```typescript
private toOverlaidTkv(r: TkvRow): OverlaidTkv {
  return {...r, values: r.values ?? []};
}
```

Also add the `TkvBase` import at the top of the file if it is not already imported (it is in `TkvRow`'s type chain — check whether `TkvBase` needs to be added to the existing import from `spf-module-tag-data.schema.js`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @arc/persistence run test:persistence -- --testPathPattern="tkv-overlay-fetcher-fetch-tkv.spec"`
Expected: PASS — all 5 assertions pass

---

### Task 6: DbTkvCalibrationQueryService

**Package:** `@arc/persistence`

**Files:**
- Create: `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/module-calibration/db-tkv-calibration-query-service.ts`
- Test: `packages/infrastructure/persistence/tests/integration/queries/module-calibration/db-tkv-calibration-query-service.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/infrastructure/persistence/tests/integration/queries/module-calibration/db-tkv-calibration-query-service.spec.ts`:

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {DataSource} from 'typeorm';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestDataSource,
  getTestRepository,
} from '../../helpers/test-database-setup.js';
import {EditActionsQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/edit-session/edit-actions-query-service.js';
import {DbTkvCalibrationQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/module-calibration/db-tkv-calibration-query-service.js';
import {DbKeyValueDefQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/key-value/db-key-value-def-query-service.js';
import {ProjectSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {ArcDbFileSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {describe, it, expect, beforeAll, afterAll, beforeEach} from '@jest/globals';

const FILE_ID = 300;
const MODULE_ID = 70;
const TAG_DEF_ID = 95;
const TAG_MAP_ID = 80;
const TKV_ID = 90;
const DEF_SYSTEM_ID = 310;
const PARAM_DEF_ID = 25;
const PAYLOAD_ID = 35;

async function seedAll(ds: DataSource) {
  await getTestRepository(ProjectSchema).save({systemId: 2, name: 'P2', description: '', type: 'Offline'});
  await getTestRepository(ArcDbFileSchema).save({
    systemId: FILE_ID, projectSystemId: 2, fileName: 'g.acdb',
    description: '', metadata: '{}', isTarget: true, lastReservedId: 0,
  });
  await ds.query(
    `INSERT OR IGNORE INTO processor_definitions (system_id, processor_definition_id, name, file_system_id) VALUES (2, 2, 'proc2', ${FILE_ID})`,
  );
  await ds.query(`INSERT INTO subgraphs (system_id, name, subgraph_id, is_imported, file_system_id) VALUES (2, 'sg2', 2, 0, ${FILE_ID})`);
  await ds.query(`INSERT INTO containers (system_id, container_id, file_system_id) VALUES (2, 2, ${FILE_ID})`);
  await ds.query(`INSERT INTO nodes (system_id, instance_id, subgraph_system_id, container_system_id, file_system_id) VALUES (${MODULE_ID}, 2, 2, 2, ${FILE_ID})`);
  await ds.query(`INSERT OR IGNORE INTO spf_module_definitions (system_id, module_definition_id, name, file_system_id) VALUES (${DEF_SYSTEM_ID}, 2, 'mod2', ${FILE_ID})`);
  await ds.query(`INSERT INTO spf_modules (system_id, definition_system_id) VALUES (${MODULE_ID}, ${DEF_SYSTEM_ID})`);
  await ds.query(`INSERT INTO tag_definitions (system_id, tag_id, name, is_voice, file_system_id) VALUES (${TAG_DEF_ID}, 2, 'mode', 0, ${FILE_ID})`);
  await ds.query(`INSERT INTO module_tag_id_map (system_id, spf_module_system_id, tag_definition_system_id) VALUES (${TAG_MAP_ID}, ${MODULE_ID}, ${TAG_DEF_ID})`);
  await ds.query(`INSERT INTO tkv (system_id, module_tag_id_map_system_id) VALUES (${TKV_ID}, ${TAG_MAP_ID})`);
  await ds.query(`INSERT OR IGNORE INTO spf_module_parameter_definitions (system_id, parameter_id, name, elements_structure, is_read_only, pid_type, definition_system_id) VALUES (${PARAM_DEF_ID}, 1, 'gain', '[]', 0, 'PID', ${DEF_SYSTEM_ID})`);
  await ds.query(`INSERT INTO tkv_parameter_payload (system_id, tkv_system_id, parameter_system_id, payload) VALUES (${PAYLOAD_ID}, ${TKV_ID}, ${PARAM_DEF_ID}, X'05000000')`);
}

function makeService(ds: DataSource): DbTkvCalibrationQueryService {
  const editSvc = new EditActionsQueryService(ds.manager);
  const kvSvc = new DbKeyValueDefQueryService(ds, editSvc);
  return new DbTkvCalibrationQueryService(ds, editSvc, kvSvc);
}

describe('DbTkvCalibrationQueryService', () => {
  beforeAll(setupIntegrationTest);
  afterAll(teardownIntegrationTest);
  beforeEach(setupEachTest);

  describe('getTkv', () => {
    it('returns TkvReadModel for existing TKV (no session)', async () => {
      const ds = getTestDataSource();
      await seedAll(ds);
      const svc = makeService(ds);
      const result = await svc.getTkv(FILE_ID, MODULE_ID, TAG_MAP_ID, TKV_ID);
      expect(result).not.toBeNull();
      expect(result?.systemId).toBe(TKV_ID);
      expect(result?.moduleTagIdMapSystemId).toBe(TAG_MAP_ID);
    });

    it('returns null for unknown tkvSystemId', async () => {
      const ds = getTestDataSource();
      await seedAll(ds);
      const svc = makeService(ds);
      expect(await svc.getTkv(FILE_ID, MODULE_ID, TAG_MAP_ID, 9999)).toBeNull();
    });

    it('returns null when tkvSystemId is under wrong moduleTagIdMapSystemId', async () => {
      const ds = getTestDataSource();
      await seedAll(ds);
      const svc = makeService(ds);
      expect(await svc.getTkv(FILE_ID, MODULE_ID, 9999, TKV_ID)).toBeNull();
    });
  });

  describe('getTkvPayloads', () => {
    it('returns all payloads for the TKV (no session)', async () => {
      const ds = getTestDataSource();
      await seedAll(ds);
      const svc = makeService(ds);
      const payloads = await svc.getTkvPayloads(FILE_ID, MODULE_ID, TKV_ID);
      expect(payloads).toHaveLength(1);
      expect(payloads[0].systemId).toBe(PAYLOAD_ID);
      expect(payloads[0].parameterSystemId).toBe(PARAM_DEF_ID);
      expect(payloads[0].payload).toBeInstanceOf(Uint8Array);
    });

    it('filters to requested paramSystemIds (payload PKs)', async () => {
      const ds = getTestDataSource();
      await seedAll(ds);
      const svc = makeService(ds);
      // PAYLOAD_ID=35 exists; 9999 does not
      const payloads = await svc.getTkvPayloads(FILE_ID, MODULE_ID, TKV_ID, [PAYLOAD_ID]);
      expect(payloads).toHaveLength(1);
      expect(payloads[0].systemId).toBe(PAYLOAD_ID);
    });

    it('returns empty array when paramSystemIds has no matches', async () => {
      const ds = getTestDataSource();
      await seedAll(ds);
      const svc = makeService(ds);
      const payloads = await svc.getTkvPayloads(FILE_ID, MODULE_ID, TKV_ID, [9999]);
      expect(payloads).toHaveLength(0);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @arc/persistence run test:persistence -- --testPathPattern="db-tkv-calibration-query-service.spec"`
Expected: FAIL — module not found for `db-tkv-calibration-query-service.js`

- [ ] **Step 3: Create DbTkvCalibrationQueryService**

```typescript
// packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/module-calibration/db-tkv-calibration-query-service.ts
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {DataSource} from 'typeorm';
import type {
  TkvQueryService,
  TkvReadModel,
  ParameterPayloadReadModel,
  KeyValueDefQueryService,
} from '@arc/core';
import {RESULT_KIND} from '@arc/core';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import {resolveActiveSessionId} from '../shared/session-resolver.js';
import {
  TkvOverlayFetcher,
  type OverlaidTkv,
} from '../../fetchers/tkv-overlay-fetcher.js';
import type {TkvParameterPayloadBase} from '../../entity-schema/usecase-data/module/spf-module-tag-data.schema.js';

/**
 * Database implementation of TkvQueryService.
 *
 * Single-TKV fetch delegated to TkvOverlayFetcher.fetchTkv (new method).
 * Payload fetch delegated to TkvOverlayFetcher.fetchTkvPayloads (existing).
 * Key-value pair resolution (transformToTkvReadModel) delegated to
 * KeyValueDefQueryService — same cross-aggregate enrichment as CKV.
 *
 * Aggregate IDs in edit_actions:
 *   tkv                   → aggregateId = moduleTagIdMapSystemId
 *   tkv_parameter_payload → matched by tkvSystemId in newValue
 */
export class DbTkvCalibrationQueryService implements TkvQueryService {
  private readonly tkvFetcher: TkvOverlayFetcher;

  constructor(
    private readonly dataSource: DataSource,
    editActionsQueryService: EditActionsQueryService,
    private readonly keyValueDefQueryService: KeyValueDefQueryService,
  ) {
    this.tkvFetcher = new TkvOverlayFetcher(dataSource.manager, editActionsQueryService);
  }

  async getTkv(
    fileSystemId: number,
    moduleSystemId: number,
    moduleTagIdMapSystemId: number,
    tkvSystemId: number,
  ): Promise<TkvReadModel | null> {
    const sessionId = await resolveActiveSessionId(this.dataSource, fileSystemId);
    const overlaid = await this.tkvFetcher.fetchTkv(
      tkvSystemId,
      moduleTagIdMapSystemId,
      sessionId,
    );
    return overlaid ? this.transformToTkvReadModel(overlaid, fileSystemId) : null;
  }

  async getTkvPayloads(
    fileSystemId: number,
    moduleSystemId: number,
    tkvSystemId: number,
    paramSystemIds?: number[],
  ): Promise<ParameterPayloadReadModel[]> {
    const sessionId = await resolveActiveSessionId(this.dataSource, fileSystemId);
    const all = await this.tkvFetcher.fetchTkvPayloads(tkvSystemId, sessionId);
    const filtered =
      paramSystemIds && paramSystemIds.length > 0
        ? all.filter(p => paramSystemIds.includes(p.systemId))
        : all;
    return filtered.map(p => this.toParameterPayloadReadModel(p));
  }

  private async transformToTkvReadModel(
    row: OverlaidTkv,
    fileSystemId: number,
  ): Promise<TkvReadModel> {
    const valueDefIds = row.values.map(v => v.valueDefSystemId);
    const pairsResult =
      await this.keyValueDefQueryService.getKeyValueSummaryForGivenValues(
        valueDefIds,
        fileSystemId,
      );
    if (pairsResult.kind === RESULT_KIND.Fail) {
      throw new Error(
        `Failed to resolve TKV key-value pairs: ${pairsResult.issues.map(e => e.message).join(', ')}`,
      );
    }
    return {
      systemId: row.systemId,
      moduleTagIdMapSystemId: row.moduleTagIdMapSystemId,
      keyValuePairs: pairsResult.data,
    };
  }

  private toParameterPayloadReadModel(
    row: TkvParameterPayloadBase,
  ): ParameterPayloadReadModel {
    return {
      systemId: row.systemId,
      parameterSystemId: row.parameterSystemId,
      payload: row.payload ?? null,
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @arc/persistence run test:persistence -- --testPathPattern="db-tkv-calibration-query-service.spec"`
Expected: PASS — all 6 assertions pass

---

### Task 7: Wiring — DbSpfModuleQueryService + QueryHandlerRegistry + Controller

**Packages:** `@arc/persistence`, `@arc/core`, `@arc/api`

**Files:**
- Modify: `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/spf-module/db-spf-module-query-service.ts`
- Modify: `packages/core/src/application/orchestration/cqrs/registries/query-handler-registry.ts`
- Modify: `packages/api/src/presentation/rest/modules/spf-module/spf-module.controller.ts`

- [ ] **Step 1: Add tkvQueryService to DbSpfModuleQueryService**

In `packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/spf-module/db-spf-module-query-service.ts`:

1. Add import at the top (alongside the existing `DbCkvCalibrationQueryService` import):
```typescript
import {DbTkvCalibrationQueryService} from '../module-calibration/db-tkv-calibration-query-service.js';
```

2. Add `tkvQueryService` property declaration alongside `ckvQueryService`:
```typescript
readonly tkvQueryService: TkvQueryService;
```
Also add `TkvQueryService` to the imports from `@arc/core`.

3. In the constructor body, add after the `ckvQueryService` instantiation:
```typescript
this.tkvQueryService = new DbTkvCalibrationQueryService(
  dataSource,
  editActionsSvc,
  keyValueDefQuerySvc,
);
```

- [ ] **Step 2: Register GetTkvCalibrationDataHandler in QueryHandlerRegistry**

In `packages/core/src/application/orchestration/cqrs/registries/query-handler-registry.ts`:

1. Add two imports alongside the existing CKV imports (around line 50–51):
```typescript
import {GetTkvCalibrationDataQuery} from '../../../usecase-designer/spf-module/get-tag-data/get-tkv-cal-data.query.js';
import {GetTkvCalibrationDataHandler} from '../../../usecase-designer/spf-module/get-tag-data/get-tkv-cal-data.handler.js';
```

2. Register the handler inside `registerAllQueryHandlers()`, after the `GetCkvCalibrationDataQuery` block (around line 217):
```typescript
this.queryHandlerFactories.set(GetTkvCalibrationDataQuery, {
  create: (deps: QueryHandlerDependencies) =>
    new GetTkvCalibrationDataHandler(deps.queryServices, deps.logger),
});
```

- [ ] **Step 3: Implement getTagData in the controller**

In `packages/api/src/presentation/rest/modules/spf-module/spf-module.controller.ts`, replace the body of `getTagData` (lines 571–586):

```typescript
async getTagData(
  @Param('projectId') projectId: string,
  @Param('spfModuleSystemId') spfModuleSystemId: string,
  @Param('tagSystemId') tagSystemId: string,
  @Param('tkvSystemId') tkvSystemId: string,
  @Query('param-system-ids') paramSystemIds?: string,
): Promise<ApiResult<TkvCalDataResponseDto>> {
  const clientId = 'client-id'; // TODO: extract real clientId from JWT once auth wiring is done
  const query = new GetTkvCalibrationDataQuery(
    projectId,
    spfModuleSystemId,
    tagSystemId,
    tkvSystemId,
    clientId,
    paramSystemIds,
  );
  const result = await this.queryBus.execute<Result<TkvCalDataResponseDto>>(query);
  return toApiResult(result);
}
```

Also add `GetTkvCalibrationDataQuery` to the imports at the top of the controller file (alongside `GetCkvCalibrationDataQuery`).

- [ ] **Step 4: Build all packages to verify**

Run: `pnpm --filter @arc/core run build && pnpm --filter @arc/persistence run build && pnpm --filter @arc/api run build`
Expected: PASS — no TypeScript errors across all three packages

---

### Task 8: End-to-End Smoke Test

**Package:** `@arc/api`

**Files:**
- Test: `packages/api/tests/e2e/modules/spf-module/get-tkv-data.e2e-spec.ts`

- [ ] **Step 1: Write the E2E test**

> Locate the existing CKV E2E test at `packages/api/tests/e2e/modules/spf-module/` and use its seed helpers (project, file, module, CKV) as a template for structuring the TKV seed. Add tag_definition + module_tag_id_map + tkv + tkv_parameter_payload rows.

```typescript
/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
// packages/api/tests/e2e/modules/spf-module/get-tkv-data.e2e-spec.ts
// Skeleton — fill seed helpers by copying from the CKV E2E test in the same folder.

import {describe, it, expect, beforeAll, afterAll, beforeEach} from '@jest/globals';
// ... import test app setup helpers

describe('GET /spf-modules/:id/tag-data/:tagId/:tkvId', () => {
  // beforeAll: start NestJS test app
  // beforeEach: seed DB (project, file, module, tag_definition, module_tag_id_map, tkv, tkv_parameter_payload, spf_module_parameter_definition)
  // afterAll: close test app

  it('returns 200 with TkvCalDataDto for valid IDs', async () => {
    // GET /{projectId}/spf-modules/{moduleId}/tag-data/{tagId}/{tkvId}
    // expect status 200
    // expect body.data.systemId === String(tkvId)
    // expect body.data.Tkv to be an array
    // expect body.data.parameters to be an array
  });

  it('returns 200 when param-system-ids filter matches existing payloads', async () => {
    // ?param-system-ids={payloadId}
    // expect status 200, parameters.length === 1
  });

  it('returns 207 when param-system-ids contains an unknown payload PK', async () => {
    // ?param-system-ids={payloadId},9999
    // expect status 207, issues contains message referencing 9999
  });

  it('returns 404 when tkvSystemId is not found', async () => {
    // GET with tkvSystemId=9999
    // expect status 404
  });

  it('returns 404 when tagSystemId not under the module', async () => {
    // GET with tagSystemId=9999
    // expect status 404
  });

  it('returns 404 when spfModuleSystemId not found', async () => {
    // GET with moduleSystemId=9999
    // expect status 404
  });

  it('returns 400 for non-numeric tkvSystemId', async () => {
    // GET with tkvSystemId=abc
    // expect status 400
  });

  it('returns 400 for non-numeric tagSystemId', async () => {
    // GET with tagSystemId=xyz
    // expect status 400
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @arc/api run test:api -- --testPathPattern="get-tkv-data.e2e-spec"`
Expected: FAIL — test app initialises but assertions fail (endpoints not wired or DB not seeded)

- [ ] **Step 3: Fill in seed helpers and assertions**

Copy the seed pattern from the CKV E2E test. Add seed rows for:
- `tag_definitions` — one row with `tag_id`, `name`, `file_system_id`
- `module_tag_id_map` — one row linking module ↔ tag_definition
- `tkv` — one row linking to `module_tag_id_map`
- `tkv_parameter_payload` — one row per parameter (use the same `spf_module_parameter_definitions` row as the CKV test)

Replace skeleton `it` bodies with real HTTP calls and assertions using the test app's `request` helper.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @arc/api run test:api -- --testPathPattern="get-tkv-data.e2e-spec"`
Expected: PASS — all assertions pass
