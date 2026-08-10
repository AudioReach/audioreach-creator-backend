/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {ContainerQueryHandler} from '../../../../../src/application/usecase-designer/container/query/query-containers.handler.js';
import {ContainerQuery} from '../../../../../src/application/usecase-designer/container/query/query-containers.query.js';
import {
  Result,
  RESULT_KIND,
} from '../../../../../src/application/shared/result/result.js';

describe('ContainerQueryHandler', () => {
  const fileSystemId = 42;

  function makeQueryServices(readModels: any[], fail = false) {
    return {
      projectQueryService: {
        getFileIdByProjectId: jest.fn().mockResolvedValue(fileSystemId),
      },
      containerQueryService: {
        findAll: jest.fn().mockResolvedValue(
          fail
            ? Result.fail({
                code: 'NOT_FOUND',
                message: 'not found',
                severity: 'ERROR',
              })
            : Result.ok(readModels),
        ),
      },
    } as any;
  }

  it('returns ContainerDto array with systemId coerced to string and name from containerTypeName', async () => {
    const qs = makeQueryServices([
      {
        systemId: 10,
        containerId: 100,
        containerTypeSystemId: 5,
        containerTypeName: 'AudioProcessing',
      },
    ]);
    const result = await new ContainerQueryHandler(qs).handle(
      new ContainerQuery(1, 'client'),
    );

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind === RESULT_KIND.Ok) {
      expect(result.data).toEqual([
        {systemId: '10', id: 100, name: 'AudioProcessing'},
      ]);
    }
  });

  it('falls back to containerTypeSystemId as string when containerTypeName is null', async () => {
    const qs = makeQueryServices([
      {
        systemId: 7,
        containerId: 77,
        containerTypeSystemId: 3,
        containerTypeName: null,
      },
    ]);
    const result = await new ContainerQueryHandler(qs).handle(
      new ContainerQuery(1, 'client'),
    );

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind === RESULT_KIND.Ok) {
      expect(result.data[0].name).toBe('3');
    }
  });

  it('falls back to empty string when both containerTypeName and containerTypeSystemId are null', async () => {
    const qs = makeQueryServices([
      {
        systemId: 8,
        containerId: 88,
        containerTypeSystemId: null,
        containerTypeName: null,
      },
    ]);
    const result = await new ContainerQueryHandler(qs).handle(
      new ContainerQuery(1, 'client'),
    );

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind === RESULT_KIND.Ok) {
      expect(result.data[0].name).toBe('');
    }
  });

  it('propagates fail result from containerQueryService unchanged', async () => {
    const qs = makeQueryServices([], true);
    const result = await new ContainerQueryHandler(qs).handle(
      new ContainerQuery(1, 'client'),
    );

    expect(result.kind).toBe(RESULT_KIND.Fail);
  });

  it('resolves projectId to fileSystemId before calling findAll', async () => {
    const qs = makeQueryServices([]);
    await new ContainerQueryHandler(qs).handle(
      new ContainerQuery(99, 'client'),
    );

    expect(qs.projectQueryService.getFileIdByProjectId).toHaveBeenCalledWith(
      99,
    );
    expect(qs.containerQueryService.findAll).toHaveBeenCalledWith(fileSystemId);
  });
});
