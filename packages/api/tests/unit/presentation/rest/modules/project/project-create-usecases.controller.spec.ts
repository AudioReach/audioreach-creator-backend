/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it, jest} from '@jest/globals';
import {
  CHANGE_OPERATION,
  ISSUE_CODE,
  IssueSeverity,
  Result,
  SESSION_MODE,
  SOURCE,
} from '@arc/core';
import {InternalServerErrorException} from '@nestjs/common';
import {ProjectController} from '../../../../../../src/presentation/rest/modules/project/project.controller.js';

const session = {
  sessionId: 3,
  fileSystemId: 10,
  projectId: '1',
  mode: SESSION_MODE.Designer,
};

const outcome = {
  emittedChanges: [
    {
      systemId: 20,
      changeId: 30,
      operation: CHANGE_OPERATION.Create,
      source: SOURCE.Manual,
    },
  ],
  issues: [],
  groupId: 'group-1',
};

const details = [
  {
    ...outcome.emittedChanges[0],
    before: null,
    after: {
      isEc: false,
      gkv: [],
      alias: 'created',
      aliasId: 2,
      categories: [],
      subgraphSystemIds: [40, 41],
      dataLinks: [
        {
          systemId: 41,
          sourceNodeSystemId: 42,
          destinationNodeSystemId: 43,
          sourcePortSystemId: 44,
          destinationPortSystemId: 45,
          linkType: 'EC',
        },
      ],
      controlLinks: [
        {
          systemId: 51,
          peerNodeASystemId: 52,
          peerNodeBSystemId: 53,
          nodeAPortSystemId: 54,
          nodeBPortSystemId: 55,
          heapId: 56,
          linkType: 'INTRA_USECASE',
        },
      ],
    },
  },
];

function createController(queryResults = [Result.ok(details)]) {
  const commandBus = {execute: jest.fn().mockResolvedValue(Result.ok(outcome))};
  const queryBus = {execute: jest.fn()};
  for (const result of queryResults) {
    queryBus.execute.mockResolvedValueOnce(result);
  }
  const controller = new ProjectController(
    commandBus as never,
    queryBus as never,
    {} as never,
  );
  return {controller, commandBus, queryBus};
}

describe('ProjectController create usecases', () => {
  it('returns the unified rich response for automatic creation', async () => {
    const {controller, commandBus, queryBus} = createController();

    const response = await controller.createUsecases(
      '1',
      {
        selectedUsecaseSystemIds: ['20'],
        activeSubgraphs: [{systemId: '40', valueSystemIds: [['50']]}],
      },
      'client-1',
      session,
    );

    expect(commandBus.execute).toHaveBeenCalledTimes(1);
    expect(queryBus.execute).toHaveBeenCalledTimes(1);
    expect(response.data).toEqual({
      changes: [
        expect.objectContaining({
          systemId: '20',
          changeId: '30',
          operation: CHANGE_OPERATION.Create,
          source: SOURCE.Manual,
        }),
      ],
      issues: [],
      groupId: 'group-1',
    });
    expect(response.data.changes[0]?.after?.dataLinks).toEqual([
      {
        systemId: '41',
        sourceSystemId: '42',
        sourcePortSystemId: '44',
        destinationSystemId: '43',
        destinationPortSystemId: '45',
        linkType: 'EC',
      },
    ]);
    expect(response.data.changes[0]?.after?.controlLinks).toEqual([
      {
        systemId: '51',
        sourceSystemId: '52',
        sourcePortSystemId: '54',
        destinationSystemId: '53',
        destinationPortSystemId: '55',
        linkType: 'INTRA_USECASE',
      },
    ]);
    expect(response.data.changes[0]?.after?.subgraphSystemIds).toEqual([
      '40',
      '41',
    ]);
  });

  it('uses the same response flow for manual creation', async () => {
    const {controller, commandBus, queryBus} = createController();

    const response = await controller.createManualUsecases(
      '1',
      {
        selectedUsecaseSystemIds: ['20'],
        activeSubgraphs: [{systemId: '40', valueSystemIds: [[]]}],
      },
      'client-1',
      session,
    );

    expect(commandBus.execute).toHaveBeenCalledTimes(1);
    expect(queryBus.execute).toHaveBeenCalledTimes(1);
    expect(response.data.groupId).toBe('group-1');
    expect(response.data.changes).toHaveLength(1);
  });

  it('retries one transient projection failure without rerunning routing', async () => {
    const transientFailure = Result.fail({
      code: ISSUE_CODE.TRANSIENT_DB_READ_FAILED,
      message: 'database busy',
      severity: IssueSeverity.Error,
    });
    const {controller, commandBus, queryBus} = createController([
      transientFailure,
      Result.ok(details),
    ]);

    await controller.createUsecases(
      '1',
      {selectedUsecaseSystemIds: [], activeSubgraphs: []},
      'client-1',
      session,
    );

    expect(commandBus.execute).toHaveBeenCalledTimes(1);
    expect(queryBus.execute).toHaveBeenCalledTimes(2);
  });

  it('does not project when the routing command fails', async () => {
    const {controller, commandBus, queryBus} = createController();
    commandBus.execute.mockResolvedValueOnce(
      Result.fail({
        code: 'ROUTING_FAILED',
        message: 'routing failed',
        severity: IssueSeverity.Error,
      }),
    );

    await expect(
      controller.createUsecases(
        '1',
        {selectedUsecaseSystemIds: [], activeSubgraphs: []},
        'client-1',
        session,
      ),
    ).rejects.toThrow();
    expect(queryBus.execute).not.toHaveBeenCalled();
  });

  it('preserves the group ID when projection ultimately fails', async () => {
    const failure = Result.fail({
      code: ISSUE_CODE.DB_QUERY_FAILED,
      message: 'projection failed',
      severity: IssueSeverity.Error,
    });
    const {controller, queryBus} = createController([failure]);

    await expect(
      controller.createUsecases(
        '1',
        {selectedUsecaseSystemIds: [], activeSubgraphs: []},
        'client-1',
        session,
      ),
    ).rejects.toMatchObject<Partial<InternalServerErrorException>>({
      response: expect.objectContaining({groupId: 'group-1'}),
    });
    expect(queryBus.execute).toHaveBeenCalledTimes(1);
  });
});
