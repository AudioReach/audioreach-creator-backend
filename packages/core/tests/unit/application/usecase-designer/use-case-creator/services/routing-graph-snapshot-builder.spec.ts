/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it, jest} from '@jest/globals';
import {RESULT_KIND} from '../../../../../../src/application/shared/result/result.js';
import {READ_MODE} from '../../../../../../src/application/ports/persistence/repositories/usecase/usecase.repository.js';
import {emptyGraphEdits} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import {RoutingGraphSnapshotBuilder} from '../../../../../../src/application/usecase-designer/use-case-creator/services/routing-graph-snapshot-builder.js';

function subgraph(systemId: number) {
  return {systemId} as never;
}

function dataLink(
  systemId: number,
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
) {
  return {
    systemId,
    sourceSubgraphSystemId,
    destSubgraphSystemId,
  } as never;
}

function controlLink(
  systemId: number,
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
) {
  return {
    systemId,
    sourceSubgraphSystemId,
    destSubgraphSystemId,
  } as never;
}

function buildInput(
  effectiveActiveSubgraphs: readonly {
    systemId: number;
    sgkvs: readonly (readonly number[])[];
  }[],
  overrides?: Partial<Parameters<RoutingGraphSnapshotBuilder['build']>[0]>,
) {
  return {
    fileSystemId: 7,
    effectiveActiveSubgraphs,
    requestPolicy: {
      requestedSubgraphSystemIds: new Set(
        effectiveActiveSubgraphs.map(selection => selection.systemId),
      ),
      explicitlyExcludedSubgraphSystemIds: new Set<number>(),
      explicitlyExcludedDataLinkSystemIds: new Set<number>(),
      explicitlyExcludedControlLinkSystemIds: new Set<number>(),
    },
    sessionEdits: emptyGraphEdits(),
    ...overrides,
  };
}

function createUow(options: {
  subgraphs: readonly unknown[];
  dataLinks: readonly unknown[];
  controlLinks: readonly unknown[];
  committedUsecases?: readonly unknown[];
}) {
  const getAggregates = jest.fn(
    async () =>
      new Map(
        options.subgraphs.map(value => {
          const systemId = (value as {systemId: number}).systemId;
          return [
            systemId,
            {
              systemId,
              naturalId: 0,
              name: '',
              isImported: false,
              fileSystemId: 7,
              subgraph: value,
              properties: [],
            },
          ];
        }),
      ),
  );
  const findDataLinks = jest.fn(async () => [...options.dataLinks]);
  const findControlLinks = jest.fn(async () => [...options.controlLinks]);
  const findAll = jest.fn(async () => [...(options.committedUsecases ?? [])]);
  return {
    uow: {
      getSubgraphRepository: () => ({getAggregates}),
      getDataLinkRepository: () => ({
        findIntraUcLinksByFile: findDataLinks,
      }),
      getControlLinkRepository: () => ({
        findIntraUcLinksByFile: findControlLinks,
      }),
      getUsecaseRepository: () => ({findAll}),
    },
    getAggregates,
    findDataLinks,
    findControlLinks,
    findAll,
  };
}

describe('RoutingGraphSnapshotBuilder', () => {
  it('rejects duplicate active subgraphs before reading graph catalogs', async () => {
    const catalog = createUow({
      subgraphs: [],
      dataLinks: [],
      controlLinks: [],
    });
    const classify = jest.fn();
    const builder = new RoutingGraphSnapshotBuilder({classify} as never);

    const result = await builder.build(
      buildInput([
        {systemId: 7, sgkvs: [[70]]},
        {systemId: 3, sgkvs: [[30]]},
        {systemId: 7, sgkvs: [[71]]},
        {systemId: 3, sgkvs: [[31]]},
      ]),
      catalog.uow as never,
    );

    expect(result).toEqual(
      expect.objectContaining({
        kind: RESULT_KIND.Fail,
        issues: [
          expect.objectContaining({
            code: 'ARC-ROUTING-PREVAL-DUPLICATE-ACTIVE-SUBGRAPH-SELECTION',
            message:
              'Duplicate active-subgraph selections are not allowed ' +
              '(systemIds: [3, 7]).',
          }),
        ],
      }),
    );
    expect(catalog.getAggregates).not.toHaveBeenCalled();
    expect(catalog.findDataLinks).not.toHaveBeenCalled();
    expect(catalog.findControlLinks).not.toHaveBeenCalled();
    expect(catalog.findAll).not.toHaveBeenCalled();
    expect(classify).not.toHaveBeenCalled();
  });

  it('loads each graph catalog once and builds routable and overlay views', async () => {
    const dataLinks = [
      dataLink(100, 10, 20),
      dataLink(101, 10, 30),
      dataLink(102, 10, 20),
    ];
    const controlLinks = [controlLink(200, 10, 20), controlLink(201, 20, 30)];
    const catalog = createUow({
      subgraphs: [subgraph(10), subgraph(20)],
      dataLinks,
      controlLinks,
      committedUsecases: [subgraph(900)],
    });
    const classify = jest.fn(async () => new Set<number>([20]));
    const builder = new RoutingGraphSnapshotBuilder({classify} as never);
    const input = buildInput(
      [
        {systemId: 10, sgkvs: [[1]]},
        {systemId: 20, sgkvs: [[2]]},
      ],
      {
        requestPolicy: {
          requestedSubgraphSystemIds: new Set([10, 20]),
          explicitlyExcludedSubgraphSystemIds: new Set(),
          explicitlyExcludedDataLinkSystemIds: new Set([102]),
          explicitlyExcludedControlLinkSystemIds: new Set([200]),
        },
      },
    );

    const result = await builder.build(input, catalog.uow as never);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(catalog.getAggregates).toHaveBeenCalledTimes(1);
    expect(catalog.findDataLinks).toHaveBeenCalledTimes(1);
    expect(catalog.findControlLinks).toHaveBeenCalledTimes(1);
    expect(catalog.findAll).toHaveBeenCalledWith(7, {
      readMode: READ_MODE.Committed,
    });
    expect(classify).toHaveBeenCalledTimes(1);
    expect(result).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          routableDataLinks: [dataLinks[0]],
          routableControlLinks: [],
          overlayDataLinks: dataLinks,
          overlayControlLinks: controlLinks,
          committedUsecases: [expect.objectContaining({systemId: 900})],
        }),
      }),
    );
  });

  it('joins each subgraph with copied requested SGKVs and MDF state', async () => {
    const selectedSgkvs = [[11], [12, 13]];
    const selectedSubgraph = subgraph(10);
    const catalog = createUow({
      subgraphs: [selectedSubgraph],
      dataLinks: [],
      controlLinks: [],
    });
    const builder = new RoutingGraphSnapshotBuilder({
      classify: jest.fn(async () => new Set([10])),
    } as never);

    const result = await builder.build(
      buildInput([{systemId: 10, sgkvs: selectedSgkvs}]),
      catalog.uow as never,
    );
    selectedSgkvs[0]!.push(99);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind === RESULT_KIND.Ok) {
      expect(result.data.subgraphs[0]!.subgraph).toBe(selectedSubgraph);
      expect(result.data.subgraphs[0]!.requestedSgkvs).toEqual([
        [11],
        [12, 13],
      ]);
      expect(result.data.subgraphs[0]!.isMdf).toBe(true);
    }
  });

  it('copies and freezes session edit collections', async () => {
    const deletedSubgraph = subgraph(20);
    const sessionEdits = {
      ...emptyGraphEdits(),
      deletedSgs: [deletedSubgraph],
    };
    const catalog = createUow({
      subgraphs: [subgraph(10)],
      dataLinks: [],
      controlLinks: [],
    });
    const builder = new RoutingGraphSnapshotBuilder({
      classify: jest.fn(async () => new Set()),
    } as never);

    const result = await builder.build(
      buildInput([{systemId: 10, sgkvs: []}], {sessionEdits}),
      catalog.uow as never,
    );
    sessionEdits.deletedSgs.push(subgraph(30));

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind === RESULT_KIND.Ok) {
      expect(result.data.sessionEdits.deletedSgs).toEqual([deletedSubgraph]);
      expect(Object.isFrozen(result.data.sessionEdits)).toBe(true);
      expect(Object.isFrozen(result.data.sessionEdits.deletedSgs)).toBe(true);
    }
  });

  it('returns every missing effective active subgraph as blocking issues', async () => {
    const catalog = createUow({
      subgraphs: [subgraph(10)],
      dataLinks: [],
      controlLinks: [],
    });
    const builder = new RoutingGraphSnapshotBuilder({
      classify: jest.fn(),
    } as never);

    const result = await builder.build(
      buildInput([
        {systemId: 10, sgkvs: []},
        {systemId: 20, sgkvs: []},
        {systemId: 30, sgkvs: []},
      ]),
      catalog.uow as never,
    );

    expect(result.kind).toBe(RESULT_KIND.Fail);
    if (result.kind === RESULT_KIND.Fail) {
      expect(
        result.issues.map(issue => issue.impactedEntity?.systemId),
      ).toEqual([20, 30]);
      expect(result.issues).not.toHaveProperty('data');
    }
  });

  it('preserves link-level integrity diagnostics for malformed scoped links', async () => {
    const malformed = dataLink(900, 10, 20);
    const catalog = createUow({
      subgraphs: [subgraph(10)],
      dataLinks: [malformed],
      controlLinks: [],
    });
    const builder = new RoutingGraphSnapshotBuilder({
      classify: jest.fn(),
    } as never);

    const result = await builder.build(
      buildInput([
        {systemId: 10, sgkvs: []},
        {systemId: 20, sgkvs: []},
      ]),
      catalog.uow as never,
    );

    expect(result.kind).toBe(RESULT_KIND.Fail);
    if (result.kind === RESULT_KIND.Fail)
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'ARC-ROUTING-PREVAL-DATALINK-INTEGRITY',
            impactedEntity: expect.objectContaining({systemId: 900}),
          }),
        ]),
      );
  });
});
