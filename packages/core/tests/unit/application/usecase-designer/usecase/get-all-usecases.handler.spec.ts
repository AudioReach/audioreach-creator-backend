/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {GetAllUseCasesHandler} from '../../../../../src/application/usecase-designer/usecase/get-all/get-all-usecases.handler.js';
import {GetAllUseCasesQuery} from '../../../../../src/application/usecase-designer/usecase/get-all/get-all-usecases.query.js';
import {
  Result,
  RESULT_KIND,
} from '../../../../../src/application/shared/result/result.js';
import {USECASE_TYPE} from '../../../../../src/domain/entities/usecase-data/usecase/usecase-type.js';
import type {QueryServices} from '../../../../../src/application/ports/persistence/query-services/query-services.js';
import {UseCaseReadModel} from '../../../../../src/application/ports/persistence/query-services/usecase/query-models/usecase-read-model.js';

describe('GetAllUseCasesHandler', () => {
  function buildServices(useCases: UseCaseReadModel[] = []) {
    return {
      projectQueryService: {
        getFileIdByProjectId: jest.fn().mockResolvedValue(42),
      },
      useCaseQueryService: {
        findUseCaseReadModels: jest
          .fn()
          .mockResolvedValue({items: useCases, failed: []}),
      },
    } as unknown as jest.Mocked<QueryServices>;
  }

  it('returns the loaded use cases with an issue per use case that could not be resolved', async () => {
    const qs = buildServices([new UseCaseReadModel(7, [])]);
    qs.useCaseQueryService.findUseCaseReadModels.mockResolvedValue({
      items: [new UseCaseReadModel(7, [])],
      failed: [
        {
          systemId: 8,
          reason: 'UNRESOLVED_REFERENCE',
          missingRef: {entityType: 'ValueDefinition' as const, systemId: 30},
        },
      ],
    });

    const result = await new GetAllUseCasesHandler(qs).handle(
      new GetAllUseCasesQuery(1, 'c'),
    );

    expect(result.kind).toBe(RESULT_KIND.Partial);
    if (result.kind !== RESULT_KIND.Partial) return;
    expect(result.data.map(uc => uc.systemId)).toEqual(['7']);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'ENTITY_UNRESOLVED_REFERENCE',
        message:
          'UseCase with systemId: 0x00000008 was skipped: it references Value with systemId: 0x0000001E, which was not found in this project.',
      }),
    ]);
  });

  it('maps use case systemId to string', async () => {
    const qs = buildServices([new UseCaseReadModel(7, [])]);
    const result = await new GetAllUseCasesHandler(qs).handle(
      new GetAllUseCasesQuery(1, 'c'),
    );
    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data[0].systemId).toBe('7');
  });

  it('uses real key/value systemIds (not fabricated key_N/val_N)', async () => {
    const kv = {
      key: {keyId: 1, name: 'Device', systemId: 10},
      value: {valueId: 2, name: 'Speaker', systemId: 20},
    };
    const qs = buildServices([new UseCaseReadModel(5, [kv])]);
    const result = await new GetAllUseCasesHandler(qs).handle(
      new GetAllUseCasesQuery(1, 'c'),
    );
    if (result.kind !== RESULT_KIND.Ok) return;
    const pair = result.data[0].keyValuePairs[0];
    expect(pair.key.systemId).toBe('10');
    expect(pair.value.systemId).toBe('20');
  });

  it('resolves projectId to fileId before querying', async () => {
    const qs = buildServices([]);
    await new GetAllUseCasesHandler(qs).handle(
      new GetAllUseCasesQuery(99, 'c'),
    );
    expect(qs.projectQueryService.getFileIdByProjectId).toHaveBeenCalledWith(
      99,
    );
  });

  it('maps categories array to comma-separated string', async () => {
    const qs = buildServices([
      new UseCaseReadModel(1, [], undefined, undefined, ['catA', 'catB']),
    ]);
    const result = await new GetAllUseCasesHandler(qs).handle(
      new GetAllUseCasesQuery(1, 'c'),
    );
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data[0].usecaseCategory).toBe('catA,catB');
  });

  it('maps the UseCase type from the read model', async () => {
    const qs = buildServices([
      new UseCaseReadModel(
        1,
        [],
        undefined,
        undefined,
        undefined,
        USECASE_TYPE.Ec,
      ),
    ]);
    const result = await new GetAllUseCasesHandler(qs).handle(
      new GetAllUseCasesQuery(1, 'c'),
    );
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data[0].usecaseType).toBe(USECASE_TYPE.Ec);
  });
});
