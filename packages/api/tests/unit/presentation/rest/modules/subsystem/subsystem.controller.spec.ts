/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BadRequestException} from '@nestjs/common';
import {describe, expect, it, jest} from '@jest/globals';
import {Result} from '@arc/core';
import {SubsystemController} from '../../../../../../src/presentation/rest/modules/subsystem/subsystem.controller.js';

const subsystems = [
  {
    systemId: '10',
    naturalId: 100,
    name: 'Subsystem_100',
    parentSystemId: '20',
    dataPorts: [],
    controlPorts: [],
    filteredKeys: [],
  },
];

function createController() {
  const queryBus = {
    execute: jest.fn().mockResolvedValue(Result.ok(subsystems)),
  };
  return {
    controller: new SubsystemController(queryBus as never),
    queryBus,
  };
}

describe('SubsystemController', () => {
  describe('getAllSubsystems', () => {
    it('dispatches GetAllSubsystemsQuery and returns the result', async () => {
      const {controller, queryBus} = createController();

      const response = await controller.getAllSubsystems(
        '7',
        undefined,
        'client-1',
      );

      expect(queryBus.execute).toHaveBeenCalledTimes(1);
      const query = queryBus.execute.mock.calls[0][0] as any;
      expect(query.constructor.name).toBe('GetAllSubsystemsQuery');
      expect(query.projectId).toBe(7);
      expect(query.clientId).toBe('client-1');
      expect(query.systemIds).toBeUndefined();
      expect(response.data).toEqual(subsystems);
    });

    it('passes parsed subsystem system IDs to the query', async () => {
      const {controller, queryBus} = createController();

      await controller.getAllSubsystems('7', '10,20', 'client-1');

      const query = queryBus.execute.mock.calls[0][0] as any;
      expect(query.systemIds).toEqual([10, 20]);
    });

    it('rejects empty and invalid system IDs', async () => {
      const {controller} = createController();

      await expect(
        controller.getAllSubsystems('7', ' ', 'client-1'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        controller.getAllSubsystems('7', '10,abc', 'client-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
