/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it, jest} from '@jest/globals';
import {DATA_LINK_TYPE} from '@arc/core';
import type {DataLinkRepository, UnitOfWork} from '@arc/core';
import {ResourceNotFoundException} from '../../../../../../src/shared/exceptions/resource-not-found.exception.js';
import {DeleteDataLinkCommand} from '../../../../../../src/application/usecase-designer/data-links/delete/delete-data-link.command.js';
import {DeleteDataLinkHandler} from '../../../../../../src/application/usecase-designer/data-links/delete/delete-data-link.handler.js';

const FILE_ID = 7;
const LINK_ID = 10;

function createFixture(dataLinks: object[] = []) {
  const repository = {
    findAllLinks: jest.fn().mockResolvedValue({
      dataLinks,
      standaloneSubsystemDataLinks: [],
    }),
    deleteAggregate: jest.fn().mockResolvedValue(undefined),
    deleteCanonical: jest.fn().mockResolvedValue(undefined),
    deleteSubsystemDataLinks: jest.fn().mockResolvedValue(undefined),
    detachSubsystemDataLinks: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<DataLinkRepository>;
  const uow = {
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    isInTransaction: jest.fn().mockReturnValue(true),
    getWriteContext: jest.fn().mockReturnValue({
      session: {fileSystemId: FILE_ID},
      groupId: 'test-group',
    }),
    getDataLinkRepository: jest.fn().mockReturnValue(repository),
  } as unknown as UnitOfWork;

  return {handler: new DeleteDataLinkHandler(uow), repository, uow};
}

describe('DeleteDataLinkHandler', () => {
  it('deletes an existing data-link aggregate and returns its DTO', async () => {
    const {handler, repository, uow} = createFixture([
      {
        systemId: LINK_ID,
        sourceNodeSystemId: 1,
        destinationNodeSystemId: 2,
        sourcePortSystemId: 3,
        destinationPortSystemId: 4,
        linkType: DATA_LINK_TYPE.Normal,
        subsystemDataLinks: [],
      },
    ]);

    await expect(
      handler.handle(new DeleteDataLinkCommand(LINK_ID)),
    ).resolves.toEqual({
      deleted: {
        dataLinks: [{systemId: '10'}],
        subsystemDataLinks: [],
      },
    });
    expect(repository.findAllLinks).toHaveBeenCalledWith(FILE_ID);
    expect(repository.deleteAggregate).toHaveBeenCalledWith(LINK_ID, FILE_ID);
    expect(uow.commit).toHaveBeenCalledTimes(1);
  });

  it('throws not found and rolls back when the data link is absent', async () => {
    const {handler, repository, uow} = createFixture();

    await expect(
      handler.handle(new DeleteDataLinkCommand(LINK_ID)),
    ).rejects.toBeInstanceOf(ResourceNotFoundException);
    expect(repository.deleteAggregate).not.toHaveBeenCalled();
    expect(uow.commit).not.toHaveBeenCalled();
    expect(uow.rollback).toHaveBeenCalledTimes(1);
  });

  it('deletes a resolved segment ID and returns the segment snapshot DTO', async () => {
    const {handler, repository} = createFixture([
      {
        systemId: LINK_ID,
        subsystemDataLinks: [
          {
            systemId: 11,
            sourceNodeSystemId: 1,
            destinationNodeSystemId: 2,
            sourcePortSystemId: 3,
            destinationPortSystemId: 4,
            dataLinkSystemId: LINK_ID,
            linkType: DATA_LINK_TYPE.Normal,
          },
          {
            systemId: 12,
            sourceNodeSystemId: 2,
            destinationNodeSystemId: 3,
            sourcePortSystemId: 4,
            destinationPortSystemId: 5,
            dataLinkSystemId: LINK_ID,
            linkType: DATA_LINK_TYPE.Normal,
          },
        ],
      },
    ]);

    await expect(
      handler.handle(new DeleteDataLinkCommand(11)),
    ).resolves.toEqual({
      deleted: {
        dataLinks: [{systemId: '10'}],
        subsystemDataLinks: [{systemId: '11'}],
      },
    });
    expect(repository.deleteAggregate).not.toHaveBeenCalled();
    expect(repository.deleteSubsystemDataLinks).toHaveBeenCalledWith(
      [expect.objectContaining({systemId: 11})],
      FILE_ID,
    );
    expect(repository.deleteCanonical).toHaveBeenCalledWith(LINK_ID, FILE_ID);
    expect(repository.detachSubsystemDataLinks).toHaveBeenCalledWith(
      [expect.objectContaining({systemId: 12})],
      FILE_ID,
    );
  });

  it('rolls back if aggregate deletion fails', async () => {
    const {handler, repository, uow} = createFixture([
      {
        systemId: LINK_ID,
        sourceNodeSystemId: 1,
        destinationNodeSystemId: 2,
        sourcePortSystemId: 3,
        destinationPortSystemId: 4,
        linkType: DATA_LINK_TYPE.Normal,
      },
    ]);
    const failure = new Error('write failed');
    repository.deleteAggregate.mockRejectedValueOnce(failure);

    await expect(
      handler.handle(new DeleteDataLinkCommand(LINK_ID)),
    ).rejects.toThrow(failure);
    expect(uow.commit).not.toHaveBeenCalled();
    expect(uow.rollback).toHaveBeenCalledTimes(1);
  });
});
