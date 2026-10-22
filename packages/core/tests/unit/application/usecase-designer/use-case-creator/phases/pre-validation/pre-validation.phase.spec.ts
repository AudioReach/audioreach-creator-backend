/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataLink} from '../../../../../../../src/domain/entities/usecase-data/links/data-link.js';
import type {ControlLink} from '../../../../../../../src/domain/entities/usecase-data/links/control-link.js';
import {RESULT_KIND} from '../../../../../../../src/application/shared/result/result.js';
import {RoutingContext} from '../../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-context.js';
import {
  createAutoRoutingInput,
  emptyGraphEdits,
} from '../../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import {PreValidationPhase} from '../../../../../../../src/application/usecase-designer/use-case-creator/phases/pre-validation/pre-validation.phase.js';
import {DATA_LINK_TYPE} from '../../../../../../../src/domain/entities/usecase-data/links/data-link-type.js';
import type {UseCase} from '../../../../../../../src/domain/entities/usecase-data/usecase/usecase.js';
import {CHANGE_OPERATION} from '../../../../../../../src/application/shared/change-vocabulary.js';
import type {ActiveManualUsecaseEdit} from '../../../../../../../src/application/ports/persistence/repositories/usecase/usecase.repository.js';

function link(
  systemId: number,
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
  linkType = DATA_LINK_TYPE.Normal,
): DataLink {
  return {
    systemId,
    sourceSubgraphSystemId,
    destSubgraphSystemId,
    linkType,
  } as DataLink;
}

function usecase(
  systemId: number,
  pairs: readonly (readonly [number, number])[],
): UseCase {
  const subgraphSystemIds = [...new Set(pairs.flat())];
  return {
    systemId,
    subgraphSystemIds,
    subgraphPairs: pairs.map(
      ([sourceSubgraphSystemId, destSubgraphSystemId]) => ({
        sourceSubgraphSystemId,
        destSubgraphSystemId,
      }),
    ),
    keyVector: {valueSystemIds: []},
  } as UseCase;
}

function createFixture(options?: {
  readonly activeIds?: readonly number[];
  readonly existingIds?: readonly number[];
  readonly dataLinks?: readonly DataLink[];
  readonly controlLinks?: readonly ControlLink[];
  readonly requestedSgkvsBySubgraph?: Readonly<
    Record<number, readonly (readonly number[])[]>
  >;
  readonly mdfSubgraphIds?: readonly number[];
  readonly committedUsecases?: readonly UseCase[];
  readonly activeManualUsecaseEdits?: readonly ActiveManualUsecaseEdit[];
  readonly deletedDataLinks?: readonly DataLink[];
}) {
  const activeIds = options?.activeIds ?? [10, 20];
  const existingIds = options?.existingIds ?? activeIds;
  const dataLinks = [...(options?.dataLinks ?? [])];
  const controlLinks = [...(options?.controlLinks ?? [])];
  const input = createAutoRoutingInput({
    fileSystemId: 7,
    selection: {
      selectedUsecaseSystemIds: [],
      activeSubgraphs: activeIds.map(systemId => ({systemId, sgkvs: []})),
      excludedSubgraphSystemIds: [],
      excludedDataLinkSystemIds: [],
      excludedControlLinkSystemIds: [],
    },
    selectedUsecases: [],
    graphSnapshot: {
      subgraphs: existingIds.map(systemId => ({
        subgraph: {systemId} as never,
        requestedSgkvs: options?.requestedSgkvsBySubgraph?.[systemId] ?? [],
      })),
      routableDataLinks: dataLinks,
      routableControlLinks: controlLinks,
      overlayDataLinks: dataLinks,
      overlayControlLinks: controlLinks,
      committedUsecases: options?.committedUsecases ?? [],
      mdf: {
        effective: new Set(options?.mdfSubgraphIds ?? []),
        deleted: new Set(),
      },
      sessionEdits: {
        ...emptyGraphEdits(),
        deletedDataLinks: options?.deletedDataLinks ?? [],
      },
    },
    activeManualUsecaseEdits: options?.activeManualUsecaseEdits ?? [],
  });
  return {
    context: new RoutingContext(input),
  };
}

describe('PreValidationPhase', () => {
  const service = new PreValidationPhase();

  it('validates snapshot links without graph repository reads', async () => {
    const fixture = createFixture({dataLinks: [link(100, 10, 20)]});

    const result = await service.run(fixture.context);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(fixture.context.warnings).toEqual([]);
  });

  it('rejects every MDF subgraph with non-empty requested KV values', async () => {
    const fixture = createFixture({
      activeIds: [10, 20, 30],
      existingIds: [10, 20, 30],
      mdfSubgraphIds: [20, 30],
      requestedSgkvsBySubgraph: {
        10: [[501]],
        20: [[601]],
        30: [[], [701, 702]],
      },
    });

    const result = await service.run(fixture.context);

    expect(result.kind).toBe(RESULT_KIND.Fail);
    if (result.kind === RESULT_KIND.Fail) {
      expect(result.issues.map(issue => issue.code)).toEqual([
        'ARC-ROUTING-MDF-01',
        'ARC-ROUTING-MDF-01',
      ]);
      expect(
        result.issues.map(issue => issue.impactedEntity?.systemId),
      ).toEqual([20, 30]);
    }
    expect(fixture.context.warnings).toEqual([]);
  });

  it.each([[[]], [[[]]]])(
    'accepts MDF selections without values: %p',
    async requestedSgkvs => {
      const fixture = createFixture({
        mdfSubgraphIds: [20],
        existingIds: [10, 20],
        requestedSgkvsBySubgraph: {20: requestedSgkvs},
      });

      const result = await service.run(fixture.context);

      expect(result.kind).toBe(RESULT_KIND.Ok);
    },
  );

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

  it('accepts one physical EC connection and one MDF-transparent EC chain', async () => {
    const fixture = createFixture({
      activeIds: [1, 2, 3, 4, 5, 6],
      existingIds: [1, 2, 3, 4, 5, 6],
      mdfSubgraphIds: [4],
      dataLinks: [
        link(10, 1, 2, DATA_LINK_TYPE.Ec),
        link(20, 3, 4, DATA_LINK_TYPE.Ec),
        link(21, 4, 5, DATA_LINK_TYPE.Ec),
      ],
      committedUsecases: [
        usecase(100, [[1, 2]]),
        usecase(200, [
          [3, 4],
          [4, 5],
        ]),
      ],
    });

    const result = await service.run(fixture.context);

    expect(result.kind).toBe(RESULT_KIND.Ok);
  });

  it('rejects every UseCase containing multiple logical EC connections', async () => {
    const fixture = createFixture({
      activeIds: [1, 2, 3, 4, 5],
      existingIds: [1, 2, 3, 4, 5],
      mdfSubgraphIds: [2],
      dataLinks: [
        link(10, 1, 2, DATA_LINK_TYPE.Ec),
        link(11, 2, 3, DATA_LINK_TYPE.Ec),
        link(12, 4, 5, DATA_LINK_TYPE.Ec),
      ],
      committedUsecases: [
        usecase(200, [
          [1, 2],
          [2, 3],
          [4, 5],
        ]),
      ],
    });

    const result = await service.run(fixture.context);

    expect(result).toEqual(
      expect.objectContaining({
        kind: RESULT_KIND.Fail,
        issues: [
          expect.objectContaining({
            code: 'ARC-ROUTING-EC-MULTIPLE-LINKS',
            impactedEntity: {entityType: 'UseCase', systemId: 200},
            message: expect.stringContaining(
              'EC data-link systemIds: [10, 11, 12]',
            ),
          }),
        ],
      }),
    );
  });

  it('applies an active MANUAL update before validating EC cardinality', async () => {
    const updatedUsecase = usecase(200, [
      [1, 2],
      [3, 4],
    ]);
    const fixture = createFixture({
      activeIds: [1, 2, 3, 4],
      existingIds: [1, 2, 3, 4],
      dataLinks: [
        link(10, 1, 2, DATA_LINK_TYPE.Ec),
        link(11, 3, 4, DATA_LINK_TYPE.Ec),
      ],
      committedUsecases: [usecase(200, [[1, 2]])],
      activeManualUsecaseEdits: [
        {
          changeId: 300,
          operation: CHANGE_OPERATION.Update,
          usecase: updatedUsecase,
          referencedComponents: {
            sgSystemIds: [1, 2, 3, 4],
            dataLinkSystemIds: [10, 11],
            controlLinkSystemIds: [],
          },
        },
      ],
    });

    const result = await service.run(fixture.context);

    expect(result).toEqual(
      expect.objectContaining({
        kind: RESULT_KIND.Fail,
        issues: [
          expect.objectContaining({
            code: 'ARC-ROUTING-EC-MULTIPLE-LINKS',
            impactedEntity: {entityType: 'UseCase', systemId: 200},
          }),
        ],
      }),
    );
  });

  it('counts an about-to-be-deleted EC link when validating Rule C', async () => {
    const fixture = createFixture({
      activeIds: [1, 2, 3, 4],
      existingIds: [1, 2, 3, 4],
      dataLinks: [link(10, 1, 2, DATA_LINK_TYPE.Ec)],
      deletedDataLinks: [link(11, 3, 4, DATA_LINK_TYPE.Ec)],
      committedUsecases: [
        usecase(200, [
          [1, 2],
          [3, 4],
        ]),
      ],
    });

    const result = await service.run(fixture.context);

    expect(result).toEqual(
      expect.objectContaining({
        kind: RESULT_KIND.Fail,
        issues: [
          expect.objectContaining({
            code: 'ARC-ROUTING-EC-MULTIPLE-LINKS',
            message: expect.stringContaining(
              'EC data-link systemIds: [10, 11]',
            ),
          }),
        ],
      }),
    );
  });
});
