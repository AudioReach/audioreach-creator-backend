/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {jest, describe, it, expect} from '@jest/globals';
import {SetSubgraphHandler} from '../../../../../../src/application/usecase-designer/subgraph/set/set-subgraph.handler.js';
import {SetSubgraphCommand} from '../../../../../../src/application/usecase-designer/subgraph/set/set-subgraph.command.js';
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
  const rename = jest.fn().mockResolvedValue(undefined);
  return {
    getWriteContext: jest
      .fn()
      .mockReturnValue({session: SESSION, groupId: GROUP_ID}),
    getSubgraphRepository: jest.fn().mockReturnValue({
      subgraphExists: jest.fn().mockResolvedValue(exists),
      rename,
    }),
    _rename: rename,
  };
}

describe('SetSubgraphHandler', () => {
  it('throws ResourceNotFoundException when subgraph not found', async () => {
    const uow = makeUow(false) as any;
    const handler = new SetSubgraphHandler(uow);
    await expect(
      handler.handle(new SetSubgraphCommand(99, 'new name')),
    ).rejects.toBeInstanceOf(ResourceNotFoundException);
  });

  it('calls rename when name is provided', async () => {
    const uow = makeUow(true) as any;
    const handler = new SetSubgraphHandler(uow);
    await handler.handle(new SetSubgraphCommand(10, 'renamed'));
    expect(uow._rename).toHaveBeenCalledWith(10, 'renamed');
  });

  it('does not call rename when name is undefined', async () => {
    const uow = makeUow(true) as any;
    const handler = new SetSubgraphHandler(uow);
    await handler.handle(new SetSubgraphCommand(10, undefined));
    expect(uow._rename).not.toHaveBeenCalled();
  });

  it('returns groupId', async () => {
    const uow = makeUow(true) as any;
    const handler = new SetSubgraphHandler(uow);
    const result = await handler.handle(new SetSubgraphCommand(10, 'x'));
    expect(result).toEqual({groupId: GROUP_ID});
  });
});
