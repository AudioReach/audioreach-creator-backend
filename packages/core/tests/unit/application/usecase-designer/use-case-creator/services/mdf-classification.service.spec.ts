/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it, jest} from '@jest/globals';
import type {UnitOfWork} from '../../../../../../src/application/ports/persistence/unit-of-work.js';
import {READ_MODE} from '../../../../../../src/application/ports/persistence/repositories/shared/read-options.js';
import {MdfClassificationService} from '../../../../../../src/application/usecase-designer/use-case-creator/services/mdf-classification.service.js';
import {
  IPC_RX_MODULE_DEF_ID,
  IPC_TX_MODULE_DEF_ID,
} from '../../../../../../src/domain/entities/definitions/spf-module/ipc-module-def-ids.js';

function createUow(options?: {
  modules?: Array<{
    systemId: number;
    subgraphSystemId: number;
    definitionSystemId: number;
  }>;
  definitions?: Array<{
    systemId: number;
    naturalId: number;
  }>;
}): UnitOfWork {
  return {
    getModuleRepository: () => ({
      findModulesBySubgraphIds: jest
        .fn()
        .mockResolvedValue(options?.modules ?? []),
    }),
    getModuleDefinitionRepository: () => ({
      findBySystemIds: jest.fn().mockResolvedValue(options?.definitions ?? []),
    }),
  } as unknown as UnitOfWork;
}

describe('MdfClassificationService.classifyMdfSubgraphs', () => {
  it('classifies effective-only subgraphs; deletedMdfIds is empty', async () => {
    const uow = createUow({
      modules: [
        {systemId: 1, subgraphSystemId: 101, definitionSystemId: 11},
        {systemId: 2, subgraphSystemId: 101, definitionSystemId: 12},
      ],
      definitions: [
        {systemId: 11, naturalId: IPC_RX_MODULE_DEF_ID},
        {systemId: 12, naturalId: IPC_TX_MODULE_DEF_ID},
      ],
    });

    const result = await new MdfClassificationService().classifyMdfSubgraphs(
      [{systemId: 101}] as never,
      [],
      1,
      uow,
    );

    expect(result.effectiveMdfIds).toEqual(new Set([101]));
    expect(result.deletedMdfIds).toEqual(new Set());
  });

  it('classifies deleted-only subgraphs; effectiveMdfIds is empty', async () => {
    const uow = createUow({
      modules: [
        {systemId: 1, subgraphSystemId: 102, definitionSystemId: 11},
        {systemId: 2, subgraphSystemId: 102, definitionSystemId: 12},
      ],
      definitions: [
        {systemId: 11, naturalId: IPC_RX_MODULE_DEF_ID},
        {systemId: 12, naturalId: IPC_TX_MODULE_DEF_ID},
      ],
    });

    const result = await new MdfClassificationService().classifyMdfSubgraphs(
      [],
      [{systemId: 102}] as never,
      1,
      uow,
    );

    expect(result.effectiveMdfIds).toEqual(new Set());
    expect(result.deletedMdfIds).toEqual(new Set([102]));
  });

  it('partitions a mixed set with one effective and one deleted MDF SG; two parallel queries', async () => {
    const findModulesOverlay = jest.fn().mockResolvedValue([
      {systemId: 1, subgraphSystemId: 101, definitionSystemId: 11},
      {systemId: 2, subgraphSystemId: 101, definitionSystemId: 12},
    ]);
    const findModulesCommitted = jest.fn().mockResolvedValue([
      {systemId: 3, subgraphSystemId: 102, definitionSystemId: 11},
      {systemId: 4, subgraphSystemId: 102, definitionSystemId: 12},
    ]);
    const findModules = jest
      .fn()
      .mockImplementationOnce(findModulesOverlay)
      .mockImplementationOnce(findModulesCommitted);
    const uow = {
      getModuleRepository: () => ({findModulesBySubgraphIds: findModules}),
      getModuleDefinitionRepository: () => ({
        findBySystemIds: jest.fn().mockResolvedValue([
          {systemId: 11, naturalId: IPC_RX_MODULE_DEF_ID},
          {systemId: 12, naturalId: IPC_TX_MODULE_DEF_ID},
        ]),
      }),
    } as unknown as UnitOfWork;

    const result = await new MdfClassificationService().classifyMdfSubgraphs(
      [{systemId: 101}] as never,
      [{systemId: 102}] as never,
      1,
      uow,
    );

    expect(result.effectiveMdfIds).toEqual(new Set([101]));
    expect(result.deletedMdfIds).toEqual(new Set([102]));
    expect(findModules).toHaveBeenCalledTimes(2);
    expect(findModules).toHaveBeenNthCalledWith(1, [101], 1);
    expect(findModules).toHaveBeenNthCalledWith(2, [102], 1, {
      readMode: READ_MODE.Committed,
    });
  });

  it('returns empty sets when there is no committed module evidence', async () => {
    const uow = createUow({modules: [], definitions: []});

    const result = await new MdfClassificationService().classifyMdfSubgraphs(
      [{systemId: 201}] as never,
      [{systemId: 202}] as never,
      1,
      uow,
    );

    expect(result.effectiveMdfIds).toEqual(new Set());
    expect(result.deletedMdfIds).toEqual(new Set());
  });
});
