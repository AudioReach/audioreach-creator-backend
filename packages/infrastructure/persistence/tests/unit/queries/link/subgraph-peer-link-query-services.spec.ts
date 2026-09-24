/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it, jest} from '@jest/globals';
import type {DataSource} from 'typeorm';
import {
  CONTROL_LINK_TYPE,
  DATA_LINK_TYPE,
  type SubgraphPeerLinkFilter,
} from '@arc/core';
import type {LinkOverlayFetcher} from '../../../../src/persistence-typeorm-sqllite/fetchers/link-overlay-fetcher.js';
import type {UsecaseOverlayFetcher} from '../../../../src/persistence-typeorm-sqllite/fetchers/usecase-overlay-fetcher.js';
import type {DataLinkBase} from '../../../../src/persistence-typeorm-sqllite/entity-schema/usecase-data/Links/data-link.js';
import type {ControlLinkBase} from '../../../../src/persistence-typeorm-sqllite/entity-schema/usecase-data/Links/control-link.js';
import {DbDataLinkQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/link/db-data-link-query-service.js';
import {DbControlLinkQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/link/db-control-link-query-service.js';

const FILE_ID = 55;

function createDataSource(): DataSource {
  const queryBuilder = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(null),
  };
  return {
    getRepository: jest.fn().mockReturnValue({
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    }),
  } as unknown as DataSource;
}

function dataLink(
  systemId: number,
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
  sourceNodeSystemId: number,
  sourcePortSystemId: number,
  destinationNodeSystemId: number,
  destinationPortSystemId: number,
): DataLinkBase {
  return {
    systemId,
    fileSystemId: FILE_ID,
    sourceSubgraphSystemId,
    destSubgraphSystemId,
    sourceNodeSystemId,
    sourcePortSystemId,
    destinationNodeSystemId,
    destinationPortSystemId,
    linkType: DATA_LINK_TYPE.Normal,
  };
}

function controlLink(
  systemId: number,
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
  peerNodeASystemId: number,
  nodeAPortSystemId: number,
  peerNodeBSystemId: number,
  nodeBPortSystemId: number,
): ControlLinkBase {
  return {
    systemId,
    fileSystemId: FILE_ID,
    sourceSubgraphSystemId,
    destSubgraphSystemId,
    peerNodeASystemId,
    nodeAPortSystemId,
    peerNodeBSystemId,
    nodeBPortSystemId,
    heapId: 0,
    linkType: CONTROL_LINK_TYPE.Normal,
  };
}

function usecase(
  systemId: number,
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
) {
  return {
    systemId,
    subgraphPairs: [{sourceSubgraphSystemId, destSubgraphSystemId}],
  };
}

describe('project link query services', () => {
  it('returns incoming and outgoing cross-subgraph data links and excludes internal links', async () => {
    const links = [
      dataLink(1, 10, 20, 101, 201, 102, 202),
      dataLink(2, 20, 10, 103, 203, 104, 204),
      dataLink(3, 10, 10, 105, 205, 106, 206),
      dataLink(4, 30, 40, 107, 207, 108, 208),
    ];
    const linkFetcher = {
      loadDataLinkRows: jest.fn().mockResolvedValue(links),
    };
    const usecaseFetcher = {
      getUsecases: jest
        .fn()
        .mockResolvedValue([usecase(1001, 10, 20), usecase(1002, 20, 10)]),
    };
    const service = new DbDataLinkQueryService(
      createDataSource(),
      usecaseFetcher as unknown as UsecaseOverlayFetcher,
      linkFetcher as unknown as LinkOverlayFetcher,
    );

    const result = await service.findSubgraphPeerLinks(
      {subgraphSystemId: 10},
      FILE_ID,
    );

    expect(result.data.map(link => link.link.systemId)).toEqual([1, 2]);
    expect(result.data[0].usecaseSystemIds).toEqual([1001]);
    expect(result.data[1].usecaseSystemIds).toEqual([1002]);
    expect(linkFetcher.loadDataLinkRows).toHaveBeenCalledWith(FILE_ID, null, {
      $or: [{sourceSubgraphSystemId: 10}, {destSubgraphSystemId: 10}],
    });
  });

  it('matches data-link module ports on either endpoint and intersects with subgraph filters', async () => {
    const links = [
      dataLink(1, 10, 20, 101, 201, 102, 202),
      dataLink(2, 20, 10, 103, 203, 101, 201),
      dataLink(3, 30, 40, 101, 201, 104, 204),
    ];
    const linkFetcher = {
      loadDataLinkRows: jest.fn().mockResolvedValue(links),
    };
    const usecaseFetcher = {
      getUsecases: jest.fn().mockResolvedValue([]),
    };
    const service = new DbDataLinkQueryService(
      createDataSource(),
      usecaseFetcher as unknown as UsecaseOverlayFetcher,
      linkFetcher as unknown as LinkOverlayFetcher,
    );

    const filter: SubgraphPeerLinkFilter = {
      subgraphSystemId: 10,
      moduleSystemId: 101,
      portSystemId: 201,
    };
    const result = await service.findSubgraphPeerLinks(filter, FILE_ID);

    expect(result.data.map(link => link.link.systemId)).toEqual([1, 2]);
    expect(linkFetcher.loadDataLinkRows).toHaveBeenCalledWith(FILE_ID, null, {
      $or: [
        {sourceSubgraphSystemId: 10},
        {destSubgraphSystemId: 10},
        {sourceNodeSystemId: 101, sourcePortSystemId: 201},
        {destinationNodeSystemId: 101, destinationPortSystemId: 201},
      ],
    });
  });

  it('returns control links in either peer direction and excludes internal links', async () => {
    const links = [
      controlLink(11, 10, 20, 101, 201, 102, 202),
      controlLink(12, 20, 10, 103, 203, 104, 204),
      controlLink(13, 10, 10, 105, 205, 106, 206),
    ];
    const linkFetcher = {
      loadControlLinkRows: jest.fn().mockResolvedValue(links),
    };
    const usecaseFetcher = {
      getUsecases: jest.fn().mockResolvedValue([usecase(2001, 10, 20)]),
    };
    const service = new DbControlLinkQueryService(
      createDataSource(),
      usecaseFetcher as unknown as UsecaseOverlayFetcher,
      linkFetcher as unknown as LinkOverlayFetcher,
    );

    const result = await service.findSubgraphPeerLinks(
      {subgraphSystemId: 10},
      FILE_ID,
    );

    expect(result.data.map(link => link.link.systemId)).toEqual([11, 12]);
    expect(result.data[0].usecaseSystemIds).toEqual([2001]);
    expect(result.data[1].usecaseSystemIds).toEqual([2001]);
  });

  it('matches control-link module ports on either peer and returns empty usecase associations', async () => {
    const links = [
      controlLink(11, 10, 20, 101, 201, 102, 202),
      controlLink(12, 20, 30, 103, 203, 101, 201),
      controlLink(13, 30, 40, 104, 204, 105, 205),
    ];
    const linkFetcher = {
      loadControlLinkRows: jest.fn().mockResolvedValue(links),
    };
    const usecaseFetcher = {
      getUsecases: jest.fn().mockResolvedValue([]),
    };
    const service = new DbControlLinkQueryService(
      createDataSource(),
      usecaseFetcher as unknown as UsecaseOverlayFetcher,
      linkFetcher as unknown as LinkOverlayFetcher,
    );

    const result = await service.findSubgraphPeerLinks(
      {moduleSystemId: 101, portSystemId: 201},
      FILE_ID,
    );

    expect(result.data.map(link => link.link.systemId)).toEqual([11, 12]);
    expect(result.data.every(link => link.usecaseSystemIds.length === 0)).toBe(
      true,
    );
  });
});
