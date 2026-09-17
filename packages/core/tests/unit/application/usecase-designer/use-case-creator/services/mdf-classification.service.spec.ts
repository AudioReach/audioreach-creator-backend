/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it, jest} from '@jest/globals';
import type {UnitOfWork} from '../../../../../../src/application/ports/persistence/unit-of-work.js';
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

describe('MdfClassificationService', () => {
  it('classifies exactly one IPC TX/RX module pair in either order', async () => {
    const uow = createUow({
      modules: [
        {systemId: 1, subgraphSystemId: 101, definitionSystemId: 11},
        {systemId: 2, subgraphSystemId: 101, definitionSystemId: 12},
        {systemId: 3, subgraphSystemId: 102, definitionSystemId: 11},
      ],
      definitions: [
        {systemId: 11, naturalId: IPC_RX_MODULE_DEF_ID},
        {systemId: 12, naturalId: IPC_TX_MODULE_DEF_ID},
      ],
    });

    await expect(
      new MdfClassificationService().classify(
        [{systemId: 101}, {systemId: 102}] as never,
        1,
        uow,
      ),
    ).resolves.toEqual(new Set([101]));
  });

  it('does not query repositories for empty candidates', async () => {
    const uow = createUow();
    await expect(
      new MdfClassificationService().classify([], 1, uow),
    ).resolves.toEqual(new Set());
  });
});
