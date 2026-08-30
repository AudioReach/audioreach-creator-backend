/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {jest, describe, it, expect} from '@jest/globals';
import {PatchSubgraphHandler} from '../../../../../../src/application/usecase-designer/subgraph/patch/patch-subgraph.handler.js';
import {PatchSubgraphCommand} from '../../../../../../src/application/usecase-designer/subgraph/patch/patch-subgraph.command.js';
import {ResourceNotFoundException} from '../../../../../../src/shared/exceptions/resource-not-found.exception.js';

const SESSION = {
  sessionId: 1,
  fileSystemId: 7,
  userId: 'u',
  clientId: 'c',
  sessionMode: 'Designer',
};
const GROUP_ID = 'g1';

function makeUow(exists: boolean) {
  const setName = jest.fn().mockResolvedValue(undefined);
  return {
    getWriteContext: jest
      .fn()
      .mockReturnValue({session: SESSION, groupId: GROUP_ID}),
    getSubgraphRepository: jest.fn().mockReturnValue({
      subgraphExists: jest.fn().mockResolvedValue(exists),
      setName,
    }),
    _setName: setName,
  };
}

describe('PatchSubgraphHandler', () => {
  it('throws ResourceNotFoundException when subgraph not found', async () => {
    const uow = makeUow(false) as any;
    const handler = new PatchSubgraphHandler(uow);
    await expect(
      handler.handle(new PatchSubgraphCommand(99, 'new name')),
    ).rejects.toBeInstanceOf(ResourceNotFoundException);
  });

  it('calls setName when name is provided', async () => {
    const uow = makeUow(true) as any;
    const handler = new PatchSubgraphHandler(uow);
    await handler.handle(new PatchSubgraphCommand(10, 'renamed'));
    expect(uow._setName).toHaveBeenCalledWith(10, 'renamed');
  });

  it('does not call setName when name is undefined', async () => {
    const uow = makeUow(true) as any;
    const handler = new PatchSubgraphHandler(uow);
    await handler.handle(new PatchSubgraphCommand(10, undefined));
    expect(uow._setName).not.toHaveBeenCalled();
  });

  it('returns groupId', async () => {
    const uow = makeUow(true) as any;
    const handler = new PatchSubgraphHandler(uow);
    const result = await handler.handle(new PatchSubgraphCommand(10, 'x'));
    expect(result).toEqual({groupId: GROUP_ID});
  });
});
