/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BadRequestException} from '@nestjs/common';
import {describe, expect, it, jest} from '@jest/globals';
import {Result} from '@arc/core';
import {SubgraphController} from '../../../../../../src/presentation/rest/modules/subgraph/subgraph.controller.js';

const subgraphs = [
  {
    systemId: '10',
    naturalId: 100,
    name: 'SG_100',
    subGraphSharedType: 'None',
    SGKV: [],
  },
];

function createController() {
  const queryBus = {
    execute: jest.fn().mockResolvedValue(Result.ok(subgraphs)),
  };
  const commandBus = {execute: jest.fn()};
  const controller = new SubgraphController(
    queryBus as never,
    commandBus as never,
  );
  return {controller, queryBus};
}

describe('SubgraphController', () => {
  describe('getAllSubgraphs', () => {
    it('executes GetAllSubgraphsQuery and returns subgraph DTOs with endpoint links', async () => {
      const {controller, queryBus} = createController();

      const response = await controller.getAllSubgraphs(
        '7',
        'client-1',
        undefined,
      );

      expect(queryBus.execute).toHaveBeenCalledTimes(1);
      const query = queryBus.execute.mock.calls[0][0] as any;
      expect(query.constructor.name).toBe('GetAllSubgraphsQuery');
      expect(query.projectId).toBe(7);
      expect(query.clientId).toBe('client-1');
      expect(query.systemIds).toBeUndefined();
      expect(response.data).toEqual([
        {...subgraphs[0], relatedEndPointLinks: []},
      ]);
    });

    it('passes parsed system IDs to GetAllSubgraphsQuery', async () => {
      const {controller, queryBus} = createController();

      await controller.getAllSubgraphs('7', 'client-1', '10,20');

      const query = queryBus.execute.mock.calls[0][0] as any;
      expect(query.systemIds).toEqual([10, 20]);
    });

    it('rejects empty systemId query parameter', async () => {
      const {controller} = createController();

      await expect(
        controller.getAllSubgraphs('7', 'client-1', ' '),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects invalid systemId values', async () => {
      const {controller} = createController();

      await expect(
        controller.getAllSubgraphs('7', 'client-1', '10,abc'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
