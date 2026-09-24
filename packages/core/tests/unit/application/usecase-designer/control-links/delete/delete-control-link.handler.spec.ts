/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it, jest} from '@jest/globals';
import {CONTROL_LINK_TYPE, NodeType} from '@arc/core';
import type {ControlLinkRepository, UnitOfWork} from '@arc/core';
import {ResourceNotFoundException} from '../../../../../../src/shared/exceptions/resource-not-found.exception.js';
import {DeleteControlLinkCommand} from '../../../../../../src/application/usecase-designer/control-links/delete/delete-control-link.command.js';
import {DeleteControlLinkHandler} from '../../../../../../src/application/usecase-designer/control-links/delete/delete-control-link.handler.js';

const FILE_ID = 7;
const LINK_ID = 10;

function createFixture(controlLinks: object[] = []) {
  const repository = {
    findAllLinks: jest.fn().mockResolvedValue({
      controlLinks,
      standaloneSubsystemControlLinks: [],
    }),
    deleteAggregate: jest.fn().mockResolvedValue(undefined),
    deleteCanonical: jest.fn().mockResolvedValue(undefined),
    deleteSubsystemControlLinks: jest.fn().mockResolvedValue(undefined),
    detachSubsystemControlLinks: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<ControlLinkRepository>;
  const subsystemRepository = {
    getAllNodesWithParents: jest.fn().mockResolvedValue([
      {systemId: 1, parentSystemId: null, type: NodeType.Module},
      {systemId: 2, parentSystemId: null, type: NodeType.Module},
      {systemId: 20, parentSystemId: null, type: NodeType.Subsystem},
    ]),
    clearControlPortIntents: jest.fn().mockResolvedValue(undefined),
  };
  const uow = {
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    isInTransaction: jest.fn().mockReturnValue(true),
    getWriteContext: jest.fn().mockReturnValue({
      session: {fileSystemId: FILE_ID},
      groupId: 'test-group',
    }),
    getControlLinkRepository: jest.fn().mockReturnValue(repository),
    getSubsystemRepository: jest.fn().mockReturnValue(subsystemRepository),
  } as unknown as UnitOfWork;

  return {
    handler: new DeleteControlLinkHandler(uow),
    repository,
    subsystemRepository,
    uow,
  };
}

describe('DeleteControlLinkHandler', () => {
  it('deletes an existing canonical control link and returns its DTO', async () => {
    const {handler, repository, uow} = createFixture([
      {
        systemId: LINK_ID,
        peerNodeASystemId: 1,
        peerNodeBSystemId: 2,
        nodeAPortSystemId: 3,
        nodeBPortSystemId: 4,
        linkType: CONTROL_LINK_TYPE.Normal,
        subsystemControlLinks: [],
      },
    ]);

    await expect(
      handler.handle(new DeleteControlLinkCommand(LINK_ID)),
    ).resolves.toEqual({
      deleted: {
        controlLinks: [{systemId: '10'}],
        subsystemControlLinks: [],
      },
      updated: {subsystems: []},
    });
    expect(repository.deleteAggregate).toHaveBeenCalledWith(LINK_ID, FILE_ID);
    expect(uow.commit).toHaveBeenCalledTimes(1);
  });

  it('deletes a resolved segment ID and returns the segment snapshot DTO', async () => {
    const {handler, repository} = createFixture([
      {
        systemId: LINK_ID,
        subsystemControlLinks: [
          {
            systemId: 11,
            peerNodeASystemId: 1,
            peerNodeBSystemId: 20,
            nodeAPortSystemId: 3,
            nodeBPortSystemId: 4,
            controlLinkSystemId: LINK_ID,
            linkType: CONTROL_LINK_TYPE.Normal,
          },
          {
            systemId: 12,
            peerNodeASystemId: 20,
            peerNodeBSystemId: 2,
            nodeAPortSystemId: 4,
            nodeBPortSystemId: 5,
            controlLinkSystemId: LINK_ID,
            linkType: CONTROL_LINK_TYPE.Normal,
          },
        ],
      },
    ]);

    await expect(
      handler.handle(new DeleteControlLinkCommand(11)),
    ).resolves.toEqual({
      deleted: {
        controlLinks: [{systemId: '10'}],
        subsystemControlLinks: [{systemId: '11'}],
      },
      updated: {subsystems: []},
    });
    expect(repository.deleteAggregate).not.toHaveBeenCalled();
    expect(repository.deleteSubsystemControlLinks).toHaveBeenCalledWith(
      [expect.objectContaining({systemId: 11})],
      FILE_ID,
    );
    expect(repository.deleteCanonical).toHaveBeenCalledWith(LINK_ID, FILE_ID);
    expect(repository.detachSubsystemControlLinks).toHaveBeenCalledWith(
      [expect.objectContaining({systemId: 12})],
      FILE_ID,
    );
  });

  it('throws not found and rolls back when the target ID is absent', async () => {
    const {handler, repository, uow} = createFixture();

    await expect(
      handler.handle(new DeleteControlLinkCommand(LINK_ID)),
    ).rejects.toBeInstanceOf(ResourceNotFoundException);
    expect(repository.deleteAggregate).not.toHaveBeenCalled();
    expect(uow.commit).not.toHaveBeenCalled();
    expect(uow.rollback).toHaveBeenCalledTimes(1);
  });
});
