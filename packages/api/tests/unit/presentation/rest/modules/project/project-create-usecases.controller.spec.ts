/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it, jest} from '@jest/globals';
import {ISSUE_CODE, IssueSeverity, Result, SESSION_MODE} from '@arc/core';
import {InternalServerErrorException} from '@nestjs/common';
import {ProjectController} from '../../../../../../src/presentation/rest/modules/project/project.controller.js';

const session = {
  sessionId: 3,
  fileSystemId: 10,
  projectId: '1',
  mode: SESSION_MODE.Designer,
};

const outcome = {
  emittedChanges: [],
  issues: [],
  groupId: 'group-1',
};

function createController(queryResults = [Result.ok([])]) {
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
  it('retries one transient projection failure without rerunning routing', async () => {
    const transientFailure = Result.fail({
      code: ISSUE_CODE.TRANSIENT_DB_READ_FAILED,
      message: 'database busy',
      severity: IssueSeverity.Error,
    });
    const {controller, commandBus, queryBus} = createController([
      transientFailure,
      Result.ok([]),
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

  it('does not retry a permanent projection failure and preserves the group ID', async () => {
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

  it('does not retry a projection failure containing a permanent issue', async () => {
    const mixedFailure = Result.fail(
      {
        code: ISSUE_CODE.TRANSIENT_DB_READ_FAILED,
        message: 'database busy',
        severity: IssueSeverity.Error,
      },
      {
        code: ISSUE_CODE.DB_QUERY_FAILED,
        message: 'invalid result',
        severity: IssueSeverity.Error,
      },
    );
    const {controller, commandBus, queryBus} = createController([mixedFailure]);

    await expect(
      controller.createUsecases(
        '1',
        {selectedUsecaseSystemIds: [], activeSubgraphs: []},
        'client-1',
        session,
      ),
    ).rejects.toBeInstanceOf(InternalServerErrorException);

    expect(commandBus.execute).toHaveBeenCalledTimes(1);
    expect(queryBus.execute).toHaveBeenCalledTimes(1);
  });
});
