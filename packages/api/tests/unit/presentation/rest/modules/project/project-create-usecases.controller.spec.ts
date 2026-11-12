/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it, jest} from '@jest/globals';
import {
  CHANGE_OPERATION,
  CreateManualUsecasesCommand,
  CreateUsecasesCommand,
  IssueSeverity,
  Result,
  SESSION_MODE,
  SOURCE,
} from '@arc/core';
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
  changes: [
    {
      systemId: 21,
      changeId: 7,
      operation: CHANGE_OPERATION.Delete,
      source: SOURCE.Manual,
      before: null,
      after: null,
    },
  ],
};

const manualRequest = {
  activeSubgraphs: [
    {systemId: '21', valueSystemIds: [['31'], []]},
    {systemId: '22', valueSystemIds: [['32']]},
  ],
  includedDataLinkSystemIds: ['41'],
  includedControlLinkSystemIds: ['42'],
};

const autoRequest = {
  usecaseSystemIds: [],
  activeSubgraphs: [],
  includedDataLinkSystemIds: [],
  includedControlLinkSystemIds: [],
};

const expectedResponse = {
  changes: [
    {
      systemId: '21',
      changeId: '7',
      operation: CHANGE_OPERATION.Delete,
      source: SOURCE.Manual,
      before: null,
      after: null,
    },
  ],
  issues: [],
  groupId: 'group-1',
};

function createController() {
  const commandBus = {execute: jest.fn().mockResolvedValue(Result.ok(outcome))};
  const queryBus = {execute: jest.fn()};
  const controller = new ProjectController(
    commandBus as never,
    queryBus as never,
    {} as never,
  );
  return {controller, commandBus, queryBus};
}

const routingFailure = Result.fail({
  code: 'ROUTING_FAILED',
  message: 'routing failed',
  severity: IssueSeverity.Error,
});

describe('ProjectController create usecases', () => {
  it('dispatches raw manual input and returns the change details from the command', async () => {
    const {controller, commandBus, queryBus} = createController();

    const response = await controller.createManualUsecases(
      manualRequest,
      session,
    );

    const [command, commandSession] = commandBus.execute.mock.calls[0] ?? [];
    expect(command).toBeInstanceOf(CreateManualUsecasesCommand);
    expect(command).toMatchObject({
      fileSystemId: 10,
      input: {
        activeSubgraphs: [
          {systemId: '21', valueSystemIds: [['31'], []]},
          {systemId: '22', valueSystemIds: [['32']]},
        ],
        includedDataLinkSystemIds: ['41'],
        includedControlLinkSystemIds: ['42'],
      },
    });
    expect(commandSession).toBe(session);
    expect(queryBus.execute).not.toHaveBeenCalled();
    expect(response.data).toEqual(expectedResponse);
  });

  it('dispatches auto input and returns the change details from the command', async () => {
    const {controller, commandBus, queryBus} = createController();

    const response = await controller.createUsecases(autoRequest, session);

    expect(commandBus.execute.mock.calls[0]?.[0]).toBeInstanceOf(
      CreateUsecasesCommand,
    );
    expect(queryBus.execute).not.toHaveBeenCalled();
    expect(response.data).toEqual(expectedResponse);
  });

  it('rejects when the manual routing command fails', async () => {
    const {controller, commandBus} = createController();
    commandBus.execute.mockResolvedValueOnce(routingFailure);

    await expect(
      controller.createManualUsecases(manualRequest, session),
    ).rejects.toThrow();
  });

  it('rejects when the routing command fails', async () => {
    const {controller, commandBus} = createController();
    commandBus.execute.mockResolvedValueOnce(routingFailure);

    await expect(
      controller.createUsecases(autoRequest, session),
    ).rejects.toThrow();
  });
});
