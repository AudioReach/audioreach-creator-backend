/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it, jest} from '@jest/globals';
import {RESULT_KIND, SESSION_MODE, InvalidInputException} from '@arc/core';
import type {ActiveSession} from '@arc/core';
import {ProjectController} from '../../../../../../src/presentation/rest/modules/project/project.controller.js';
import {FixCommandDispatcher} from '../../../../../../src/infrastructure-wrapper/validation/fix-command-dispatcher.js';
import type {ApplyFixRequestDto} from '../../../../../../src/presentation/rest/modules/project/dto/apply-fix.dto.js';

const session: ActiveSession = {
  sessionId: 3,
  fileSystemId: 10,
  projectId: 1,
  mode: SESSION_MODE.Designer,
} as unknown as ActiveSession;

function createController() {
  const commandBus = {execute: jest.fn()};
  const queryBus = {execute: jest.fn()};
  const dispatcher = new FixCommandDispatcher();
  const controller = new ProjectController(
    commandBus as never,
    queryBus as never,
    {} as never,
    dispatcher,
  );
  return {controller, commandBus};
}

describe('ProjectController.applyFix', () => {
  it('throws InvalidInputException for unknown commandType', async () => {
    const {controller} = createController();
    const body: ApplyFixRequestDto = {
      commandType: 'UnknownCommand',
      commandPayload: {},
    };
    await expect(controller.applyFix('1', body, session)).rejects.toThrow(
      InvalidInputException,
    );
  });

  it('executes the resolved command and returns empty data on success', async () => {
    const {controller, commandBus} = createController();
    commandBus.execute.mockResolvedValueOnce({
      kind: RESULT_KIND.Ok,
      data: {groupId: 'g1', removedCkvSystemIds: [10]},
      issues: [],
    });

    const body: ApplyFixRequestDto = {
      commandType: 'RemoveCkvsCommand',
      commandPayload: {spfModuleSystemId: '1', ckvSystemIds: ['10']},
    };

    const result = await controller.applyFix('1', body, session);
    expect(commandBus.execute).toHaveBeenCalledTimes(1);
    expect(result.data).toBeUndefined();
  });
});
