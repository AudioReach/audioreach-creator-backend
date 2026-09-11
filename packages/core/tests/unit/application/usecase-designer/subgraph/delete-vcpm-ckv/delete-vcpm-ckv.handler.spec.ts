/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, jest} from '@jest/globals';
import type {SubgraphRepository, UnitOfWork} from '@arc/core';
import {ResourceNotFoundException} from '../../../../../../src/shared/exceptions/index.js';
import {DeleteVcpmCkvHandler} from '../../../../../../src/application/usecase-designer/subgraph/delete-vcpm-ckv/delete-vcpm-ckv.handler.js';
import {DeleteVcpmCkvCommand} from '../../../../../../src/application/usecase-designer/subgraph/delete-vcpm-ckv/delete-vcpm-ckv.command.js';

const FILE_ID = 10;
const SUBGRAPH_ID = 20;
const CKV_ID = 30;

function makeRepo(
  overrides: Partial<SubgraphRepository> = {},
): jest.Mocked<SubgraphRepository> {
  return {
    subgraphExists: jest.fn().mockResolvedValue(true),
    vcpmCkvExistsBySystemId: jest.fn().mockResolvedValue(true),
    deleteVcpmCkv: jest.fn().mockResolvedValue(undefined),
    createSubgraph: jest.fn(),
    ...overrides,
  } as unknown as jest.Mocked<SubgraphRepository>;
}

function makeUow(
  repo: jest.Mocked<SubgraphRepository>,
): jest.Mocked<UnitOfWork> {
  return {
    getWriteContext: jest.fn().mockReturnValue({
      session: {sessionId: 7, fileSystemId: FILE_ID},
      groupId: 'group-abc',
    }),
    getSubgraphRepository: jest.fn().mockReturnValue(repo),
  } as unknown as jest.Mocked<UnitOfWork>;
}

function command(): DeleteVcpmCkvCommand {
  return new DeleteVcpmCkvCommand(SUBGRAPH_ID, CKV_ID);
}

describe('DeleteVcpmCkvHandler', () => {
  it('throws when the subgraph is not found', async () => {
    const repo = makeRepo({subgraphExists: jest.fn().mockResolvedValue(false)});
    await expect(
      new DeleteVcpmCkvHandler(makeUow(repo)).handle(command()),
    ).rejects.toThrow(ResourceNotFoundException);
    await expect(
      new DeleteVcpmCkvHandler(makeUow(repo)).handle(command()),
    ).rejects.toThrow(String(SUBGRAPH_ID));
  });

  it('throws when the CKV is not found', async () => {
    const repo = makeRepo({
      vcpmCkvExistsBySystemId: jest.fn().mockResolvedValue(false),
    });
    await expect(
      new DeleteVcpmCkvHandler(makeUow(repo)).handle(command()),
    ).rejects.toThrow(ResourceNotFoundException);
    await expect(
      new DeleteVcpmCkvHandler(makeUow(repo)).handle(command()),
    ).rejects.toThrow(String(CKV_ID));
  });

  it('deletes an existing CKV', async () => {
    const repo = makeRepo();
    await new DeleteVcpmCkvHandler(makeUow(repo)).handle(command());
    expect(repo.deleteVcpmCkv).toHaveBeenCalledWith(SUBGRAPH_ID, CKV_ID);
  });
});
