/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it, jest} from '@jest/globals';
import {PatchControlLinkPropertiesHandler} from '../../../../../../src/application/usecase-designer/control-links/patch/patch-control-link-properties.handler.js';
import {PatchControlLinkPropertiesCommand} from '../../../../../../src/application/usecase-designer/control-links/patch/patch-control-link-properties.command.js';
import {ControlLink} from '../../../../../../src/domain/entities/usecase-data/links/control-link.js';
import {CONTROL_LINK_TYPE} from '../../../../../../src/domain/entities/usecase-data/links/control-link-type.js';
import type {UnitOfWork} from '../../../../../../src/application/ports/persistence/unit-of-work.js';

describe('PatchControlLinkPropertiesHandler', () => {
  it('updates only the requested canonical link heap ID', async () => {
    const target = new ControlLink(
      1,
      10,
      11,
      12,
      101,
      102,
      1,
      CONTROL_LINK_TYPE.Normal,
      1,
      1,
    );
    const connected = new ControlLink(
      2,
      10,
      12,
      13,
      102,
      103,
      1,
      CONTROL_LINK_TYPE.Normal,
      1,
      1,
    );
    const repo = {
      findBySystemId: jest
        .fn()
        .mockImplementation((id: number) => Promise.resolve(id === 1 ? target : connected)),
      findSubsystemControlRouteContext: jest.fn().mockResolvedValue({
        subsystemControlLinks: [],
      }),
      getLinksByPortSystemIds: jest
        .fn()
        .mockResolvedValue([{linkSystemId: 2, portSystemId: 102}]),
      updateHeapId: jest.fn().mockResolvedValue(undefined),
    };
    const uow = {
      startTransaction: jest.fn().mockResolvedValue(undefined),
      applyCachedActions: jest.fn().mockResolvedValue(undefined),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      isInTransaction: jest.fn().mockReturnValue(true),
      getWriteContext: jest.fn().mockReturnValue({
        session: {fileSystemId: 10},
      }),
      getControlLinkRepository: jest.fn().mockReturnValue(repo),
    } as unknown as UnitOfWork;
    const handler = new PatchControlLinkPropertiesHandler(
      uow,
      {getNextId: jest.fn()} as never,
      {} as never,
    );

    const result = await handler.handle(
      new PatchControlLinkPropertiesCommand(1, undefined, 5),
    );

    expect(repo.updateHeapId).toHaveBeenCalledWith(1, 5);
    expect(repo.updateHeapId).toHaveBeenCalledTimes(1);
    expect(result).toEqual([expect.objectContaining({systemId: '1'})]);
  });
});
