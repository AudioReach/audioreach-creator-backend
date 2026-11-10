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
  const commandBus = {execute: jest.fn().mockResolvedValue({groupId: 'g1'})};
  const controller = new SubgraphController(
    queryBus as never,
    commandBus as never,
  );
  return {controller, queryBus, commandBus};
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

  it('maps a scenario body systemId to SetSubgraphScenarioCommand', async () => {
    const {controller, commandBus} = createController();

    await controller.setSubgraphScenario(
      10,
      {systemId: '50', elements: []} as never,
      {sessionId: 1, fileSystemId: 7} as never,
    );

    expect(commandBus.execute.mock.calls[0][0]).toMatchObject({
      subgraphSystemId: 10,
      propertySystemId: 50,
      elements: [],
    });
  });

  it('maps a VSID body systemId to SetSubgraphVsidCommand', async () => {
    const {controller, commandBus} = createController();

    await controller.setSubgraphVsid(
      10,
      {systemId: '55', elements: []} as never,
      {sessionId: 1, fileSystemId: 7} as never,
    );

    expect(commandBus.execute.mock.calls[0][0]).toMatchObject({
      subgraphSystemId: 10,
      propertySystemId: 55,
      elements: [],
    });
  });

  it('maps a generic property body systemId to SetSubgraphPropertyCommand', async () => {
    const {controller, queryBus, commandBus} = createController();
    queryBus.execute.mockResolvedValueOnce(
      Result.ok({
        systemId: 52,
        naturalId: 123,
        propertyName: 'Property',
        elements: [],
      }),
    );

    await (controller.putSubgraphProperty as any)(
      '7',
      10,
      {systemId: '52', elements: []},
      {sessionId: 1, fileSystemId: 7},
      'client-1',
    );

    expect(commandBus.execute.mock.calls[0][0]).toMatchObject({
      subgraphSystemId: 10,
      propertySystemId: 52,
      elements: [],
    });
  });
});
