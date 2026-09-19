/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataLink} from '../../../../../../src/domain/entities/usecase-data/links/data-link.js';
import type {ControlLink} from '../../../../../../src/domain/entities/usecase-data/links/control-link.js';
import {RESULT_KIND} from '../../../../../../src/application/shared/result/result.js';
import {RoutingContext} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-context.js';
import {
  createAutoRoutingInput,
  emptyGraphEdits,
} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import {PreValidationService} from '../../../../../../src/application/usecase-designer/use-case-creator/phases/pre-validation.service.js';

function link(
  systemId: number,
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
): DataLink {
  return {systemId, sourceSubgraphSystemId, destSubgraphSystemId} as DataLink;
}

function createFixture(options?: {
  readonly activeIds?: readonly number[];
  readonly existingIds?: readonly number[];
  readonly dataLinks?: readonly DataLink[];
  readonly controlLinks?: readonly ControlLink[];
}) {
  const activeIds = options?.activeIds ?? [10, 20];
  const existingIds = options?.existingIds ?? activeIds;
  const dataLinks = [...(options?.dataLinks ?? [])];
  const controlLinks = [...(options?.controlLinks ?? [])];
  const input = createAutoRoutingInput({
    fileSystemId: 7,
    selectedUsecases: [],
    requestPolicy: {
      requestedSubgraphSystemIds: new Set(activeIds),
      explicitlyExcludedSubgraphSystemIds: new Set(),
      explicitlyExcludedDataLinkSystemIds: new Set(),
      explicitlyExcludedControlLinkSystemIds: new Set(),
    },
    graphSnapshot: {
      subgraphs: existingIds.map(systemId => ({
        subgraph: {systemId} as never,
        requestedSgkvs: [],
        isMdf: false,
      })),
      routableDataLinks: dataLinks,
      routableControlLinks: controlLinks,
      overlayDataLinks: dataLinks,
      overlayControlLinks: controlLinks,
      committedUsecases: [],
      sessionEdits: emptyGraphEdits(),
    },
  });
  return {
    context: new RoutingContext(input),
  };
}

describe('PreValidationService', () => {
  const service = new PreValidationService();

  it('validates snapshot links without graph repository reads', async () => {
    const fixture = createFixture({dataLinks: [link(100, 10, 20)]});

    const result = await service.run(fixture.context);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(fixture.context.warnings).toEqual([]);
  });

  it.each([
    ['source', link(100, 10, 20), [20]],
    ['destination', link(101, 10, 20), [10]],
  ] as const)(
    'rejects a snapshot link with a missing %s endpoint',
    async (_label, dataLink, existingIds) => {
      const fixture = createFixture({dataLinks: [dataLink], existingIds});

      const result = await service.run(fixture.context);

      expect(result).toEqual(
        expect.objectContaining({
          kind: RESULT_KIND.Fail,
          issues: [
            expect.objectContaining({
              code: 'ARC-ROUTING-PREVAL-DATALINK-INTEGRITY',
              impactedEntity: expect.objectContaining({
                systemId: dataLink.systemId,
              }),
            }),
          ],
        }),
      );
      expect(fixture.context.warnings).toEqual([]);
    },
  );

  it('reports every invalid routable data link before returning', async () => {
    const fixture = createFixture({
      activeIds: [10, 20, 30],
      dataLinks: [link(100, 10, 20), link(101, 20, 30)],
      existingIds: [10],
    });

    const result = await service.run(fixture.context);

    expect(result.kind).toBe(RESULT_KIND.Fail);
    if (result.kind === RESULT_KIND.Fail)
      expect(
        result.issues.map(issue => issue.impactedEntity?.systemId),
      ).toEqual([100, 101]);
    expect(fixture.context.warnings).toEqual([]);
  });

  it('warns once per isolated subgraph and ignores control-only adjacency', async () => {
    const fixture = createFixture({
      activeIds: [10, 20, 30],
      dataLinks: [link(100, 10, 20)],
      controlLinks: [
        {systemId: 200, sourceSubgraphSystemId: 30, destSubgraphSystemId: 10},
      ] as ControlLink[],
    });

    const result = await service.run(fixture.context);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(fixture.context.warnings).toEqual([
      expect.objectContaining({
        code: 'ARC-ROUTING-ISLAND-DETECTED',
        impactedEntity: expect.objectContaining({systemId: 30}),
      }),
    ]);
  });

  it('treats an excluded data link as absent adjacency because the snapshot omits it', async () => {
    const fixture = createFixture({dataLinks: []});

    const result = await service.run(fixture.context);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(
      fixture.context.warnings.map(issue => issue.impactedEntity?.systemId),
    ).toEqual([10, 20]);
  });
});
