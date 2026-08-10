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
import type {QueryServices} from '../../../../../src/application/ports/persistence/query-services/query-services.js';
import {UseCaseReadModel} from '../../../../../src/application/ports/persistence/query-services/usecase/query-models/usecase-read-model.js';

describe('GetAllUseCasesHandler', () => {
  function buildServices(useCases: UseCaseReadModel[] = []) {
    return {
      projectQueryService: {
        getFileIdByProjectId: jest.fn().mockResolvedValue(42),
      },
      useCaseQueryService: {
        getAllUseCases: jest.fn().mockResolvedValue(Result.ok(useCases)),
      },
    } as unknown as jest.Mocked<QueryServices>;
  }

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
    const pair = result.data[0].keyValueCollection[0];
    expect(pair.keyInfo.keySystemId).toBe('10');
    expect(pair.valueInfo.valueSystemId).toBe('20');
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
});
