/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {RESULT_KIND} from '../../../../../../src/application/shared/result/result.js';
import {
  createAutoRoutingInput,
  createManualRoutingInput,
  emptyGraphEdits,
} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import {RoutingContext} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-context.js';
import {DELETED_COMPONENT_TYPE} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-state.js';
import {DeletionScopeService} from '../../../../../../src/application/usecase-designer/use-case-creator/phases/deletion-scope.service.js';
import {UseCase} from '../../../../../../src/domain/entities/usecase-data/usecase/usecase.js';
import type {ControlLink} from '../../../../../../src/domain/entities/usecase-data/links/control-link.js';
import type {DataLink} from '../../../../../../src/domain/entities/usecase-data/links/data-link.js';
import type {SgkvEntry} from '../../../../../../src/application/ports/persistence/repositories/subgraph/subgraph.repository.js';

type UsecaseType = 'EC' | 'ISLAND' | 'LINKED';

interface FixtureOptions {
  readonly mode?: 'AUTO' | 'MANUAL';
  readonly usecases?: readonly UseCase[];
  readonly selectedUsecases?: readonly UseCase[];
  readonly subgraphIds?: readonly number[];
  readonly overlayDataLinks?: readonly DataLink[];
  readonly routableDataLinks?: readonly DataLink[];
  readonly overlayControlLinks?: readonly ControlLink[];
  readonly routableControlLinks?: readonly ControlLink[];
  readonly deletedSgs?: readonly number[];
  readonly deletedDataLinks?: readonly DataLink[];
  readonly deletedControlLinks?: readonly ControlLink[];
  readonly requestedSubgraphSystemIds?: readonly number[];
  readonly explicitlyExcludedSubgraphSystemIds?: readonly number[];
  readonly explicitlyExcludedDataLinkSystemIds?: readonly number[];
  readonly explicitlyExcludedControlLinkSystemIds?: readonly number[];
  readonly requestedSgkvsBySubgraph?: Readonly<
    Record<number, readonly (readonly number[])[]>
  >;
  readonly sgkvs?: readonly SgkvEntry[];
}

function usecase(
  systemId: number,
  subgraphSystemIds: readonly number[],
  subgraphPairs: readonly {
    sourceSubgraphSystemId: number;
    destSubgraphSystemId: number;
  }[],
  type: UsecaseType = 'LINKED',
  valueSystemIds: readonly number[] = [],
): UseCase {
  return new UseCase({
    systemId,
    fileSystemId: 1,
    keyVector: {valueSystemIds: [...valueSystemIds]},
    subgraphSystemIds: [...subgraphSystemIds],
    subgraphPairs: subgraphPairs.map(pair => ({...pair})),
    type,
  });
}

function dataLink(
  systemId: number,
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
  isEc = false,
): DataLink {
  return {
    systemId,
    sourceSubgraphSystemId,
    destSubgraphSystemId,
    isEc,
  } as DataLink;
}

function controlLink(
  systemId: number,
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
): ControlLink {
  return {
    systemId,
    sourceSubgraphSystemId,
    destSubgraphSystemId,
  } as ControlLink;
}

function createFixture(options: FixtureOptions = {}) {
  const committedUsecases = [...(options.usecases ?? [])];
  const selectedUsecases = [...(options.selectedUsecases ?? committedUsecases)];
  const overlayDataLinks = [...(options.overlayDataLinks ?? [])];
  const routableDataLinks = [
    ...(options.routableDataLinks ?? overlayDataLinks),
  ];
  const overlayControlLinks = [...(options.overlayControlLinks ?? [])];
  const routableControlLinks = [
    ...(options.routableControlLinks ?? overlayControlLinks),
  ];
  const sessionEdits = {
    ...emptyGraphEdits(),
    deletedSgs: (options.deletedSgs ?? []).map(
      systemId => ({systemId}) as never,
    ),
    deletedDataLinks: [...(options.deletedDataLinks ?? [])],
    deletedControlLinks: [...(options.deletedControlLinks ?? [])],
  };
  const inferredSubgraphIds = new Set<number>(options.subgraphIds ?? []);
  for (const currentUsecase of committedUsecases) {
    for (const systemId of currentUsecase.subgraphSystemIds)
      inferredSubgraphIds.add(systemId);
  }
  for (const link of [
    ...overlayDataLinks,
    ...routableDataLinks,
    ...overlayControlLinks,
    ...routableControlLinks,
  ]) {
    inferredSubgraphIds.add(link.sourceSubgraphSystemId);
    inferredSubgraphIds.add(link.destSubgraphSystemId);
  }
  const subgraphIds = [...inferredSubgraphIds];
  const inputInit = {
    fileSystemId: 1,
    selectedUsecases,
    requestPolicy: {
      requestedSubgraphSystemIds: new Set(
        options.requestedSubgraphSystemIds ?? subgraphIds,
      ),
      explicitlyExcludedSubgraphSystemIds: new Set(
        options.explicitlyExcludedSubgraphSystemIds ?? [],
      ),
      explicitlyExcludedDataLinkSystemIds: new Set(
        options.explicitlyExcludedDataLinkSystemIds ?? [],
      ),
      explicitlyExcludedControlLinkSystemIds: new Set(
        options.explicitlyExcludedControlLinkSystemIds ?? [],
      ),
    },
    graphSnapshot: {
      subgraphs: subgraphIds.map(systemId => ({
        subgraph: {systemId} as never,
        requestedSgkvs: options.requestedSgkvsBySubgraph?.[systemId] ?? [],
        isMdf: systemId === 3 || systemId === 5,
      })),
      routableDataLinks,
      routableControlLinks,
      overlayDataLinks,
      overlayControlLinks,
      committedUsecases,
      sessionEdits,
    },
  };
  const input =
    options.mode === 'MANUAL'
      ? createManualRoutingInput({...inputInit, manualTopology: {pairs: []}})
      : createAutoRoutingInput(inputInit);
  const context = new RoutingContext(input);
  const findAll = jest.fn(() => {
    throw new Error('Phase 2 must not read the usecase repository');
  });
  const getSgkvs = jest.fn().mockResolvedValue([...(options.sgkvs ?? [])]);
  const uow = {
    getUsecaseRepository: () => ({findAll}),
    getSubgraphRepository: () => ({getSgkvs}),
  };
  return {context, uow, findAll, getSgkvs};
}

function runAnalysis(
  service: DeletionScopeService,
  fixture: ReturnType<typeof createFixture>,
) {
  return service.run(fixture.context, fixture.uow as never);
}

describe('DeletionScopeService', () => {
  const service = new DeletionScopeService();

  it('builds committed impact with SG > data-link > control-link precedence', async () => {
    const currentUsecase = usecase(
      1,
      [10, 20],
      [{sourceSubgraphSystemId: 10, destSubgraphSystemId: 20}],
    );
    const fixture = createFixture({
      usecases: [currentUsecase],
      deletedSgs: [10],
      deletedDataLinks: [dataLink(101, 10, 20)],
      deletedControlLinks: [controlLink(201, 10, 20)],
    });

    const result = await runAnalysis(service, fixture);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(fixture.findAll).not.toHaveBeenCalled();
    expect(fixture.context.deletionAnalysis).toEqual({
      affectedUsecaseSystemIds: new Set([1]),
      markedForDeletion: [
        {
          usecase: currentUsecase,
          deletedComponent: {
            type: DELETED_COMPONENT_TYPE.Subgraph,
            systemId: 10,
          },
        },
      ],
      preservedUsecases: [],
      islandUseCaseCandidates: [],
      reconstructionPaths: [],
    });
  });

  it('treats alternate overlay data support as benign', async () => {
    const currentUsecase = usecase(
      1,
      [10, 20],
      [{sourceSubgraphSystemId: 10, destSubgraphSystemId: 20}],
    );
    const fixture = createFixture({
      usecases: [currentUsecase],
      deletedDataLinks: [dataLink(101, 10, 20)],
      overlayDataLinks: [dataLink(102, 10, 20)],
    });

    await runAnalysis(service, fixture);

    expect(fixture.context.deletionAnalysis).toEqual({
      affectedUsecaseSystemIds: new Set(),
      markedForDeletion: [],
      preservedUsecases: [],
      islandUseCaseCandidates: [],
      reconstructionPaths: [],
    });
  });

  it('creates one automatic island candidate and warning for control-only support', async () => {
    const currentUsecase = usecase(
      1,
      [10, 20],
      [{sourceSubgraphSystemId: 10, destSubgraphSystemId: 20}],
    );
    const fixture = createFixture({
      usecases: [currentUsecase],
      deletedDataLinks: [dataLink(101, 10, 20)],
      overlayControlLinks: [controlLink(201, 10, 20)],
    });

    const result = await runAnalysis(service, fixture);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(fixture.context.deletionAnalysis).toEqual({
      affectedUsecaseSystemIds: new Set([1]),
      markedForDeletion: [],
      preservedUsecases: [],
      islandUseCaseCandidates: [
        {
          usecase: currentUsecase,
          dataLinkLossPairs: [
            {
              sourceSubgraphSystemId: 10,
              destSubgraphSystemId: 20,
              deletedDataLinkSystemId: 101,
            },
          ],
        },
      ],
      reconstructionPaths: [],
    });
    expect(fixture.context.warnings).toEqual([
      expect.objectContaining({
        code: 'ARC-ROUTING-UC-AUTO-ISLAND',
        impactedEntity: expect.objectContaining({systemId: 1}),
      }),
    ]);
  });

  it('does not degrade an ISLAND usecase for control-only survival', async () => {
    const currentUsecase = usecase(
      1,
      [10, 20],
      [{sourceSubgraphSystemId: 10, destSubgraphSystemId: 20}],
      'ISLAND',
    );
    const fixture = createFixture({
      usecases: [currentUsecase],
      deletedDataLinks: [dataLink(101, 10, 20)],
      overlayControlLinks: [controlLink(201, 10, 20)],
    });

    await runAnalysis(service, fixture);

    expect(fixture.context.deletionAnalysis?.affectedUsecaseSystemIds).toEqual(
      new Set(),
    );
    expect(fixture.context.deletionAnalysis?.islandUseCaseCandidates).toEqual(
      [],
    );
    expect(fixture.context.warnings).toEqual([]);
  });

  it('uses MDF-only replacement as structural impact before degradation', async () => {
    const currentUsecase = usecase(
      1,
      [1, 2],
      [{sourceSubgraphSystemId: 1, destSubgraphSystemId: 2}],
    );
    const fixture = createFixture({
      usecases: [currentUsecase],
      subgraphIds: [1, 2, 3],
      deletedDataLinks: [dataLink(101, 1, 2)],
      overlayDataLinks: [dataLink(102, 1, 3), dataLink(103, 3, 2)],
      overlayControlLinks: [controlLink(201, 1, 2)],
      routableDataLinks: [dataLink(102, 1, 3), dataLink(103, 3, 2)],
    });

    await runAnalysis(service, fixture);

    expect(fixture.context.deletionAnalysis?.affectedUsecaseSystemIds).toEqual(
      new Set([1]),
    );
    expect(fixture.context.deletionAnalysis?.islandUseCaseCandidates).toEqual(
      [],
    );
    expect(fixture.context.deletionAnalysis?.markedForDeletion[0]).toEqual(
      expect.objectContaining({
        deletedComponent: {
          type: DELETED_COMPONENT_TYPE.DataLink,
          systemId: 101,
        },
      }),
    );
  });

  it('returns only DEL-02 before deletion-side closure conflicts', async () => {
    const currentUsecase = usecase(
      1,
      [10, 20],
      [{sourceSubgraphSystemId: 10, destSubgraphSystemId: 20}],
    );
    const fixture = createFixture({
      usecases: [currentUsecase],
      selectedUsecases: [],
      deletedDataLinks: [dataLink(101, 10, 20)],
      requestedSubgraphSystemIds: [10],
      explicitlyExcludedDataLinkSystemIds: [101],
    });

    const result = await runAnalysis(service, fixture);

    expect(result).toEqual({
      kind: RESULT_KIND.Fail,
      issues: [
        expect.objectContaining({
          code: 'ARC-ROUTING-DEL-02',
        }),
      ],
    });
    expect(fixture.context.deletionAnalysis).toBeNull();
  });

  it('enforces deletion-side closure after all affected UCs are selected', async () => {
    const currentUsecase = usecase(
      1,
      [10, 20],
      [{sourceSubgraphSystemId: 10, destSubgraphSystemId: 20}],
    );
    const fixture = createFixture({
      usecases: [currentUsecase],
      deletedDataLinks: [dataLink(101, 10, 20)],
      requestedSubgraphSystemIds: [10],
      explicitlyExcludedSubgraphSystemIds: [10],
      explicitlyExcludedDataLinkSystemIds: [101],
    });

    const result = await runAnalysis(service, fixture);

    expect(result).toEqual({
      kind: RESULT_KIND.Fail,
      issues: [
        expect.objectContaining({
          code: 'ARC-ROUTING-PREVAL-EDIT-SCOPE-CONFLICT',
          message: expect.stringContaining(
            'Data links marked for deletion were explicitly excluded: [101]',
          ),
        }),
      ],
    });
    expect(
      result.kind === RESULT_KIND.Fail && result.issues[0]?.message,
    ).toEqual(
      expect.stringContaining(
        'Data links marked for deletion still use subgraphs that remain in the design, but those subgraphs are missing from the selected design: [20]',
      ),
    );
    expect(
      result.kind === RESULT_KIND.Fail && result.issues[0]?.message,
    ).toEqual(
      expect.stringContaining(
        'Subgraphs still needed to validate the data-link deletion were explicitly excluded: [10]',
      ),
    );
  });

  it('does not expand deletion closure from deleted control-link endpoints', async () => {
    const fixture = createFixture({
      deletedControlLinks: [controlLink(201, 30, 40)],
      requestedSubgraphSystemIds: [],
    });

    const result = await runAnalysis(service, fixture);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(fixture.context.deletionAnalysis?.affectedUsecaseSystemIds).toEqual(
      new Set(),
    );
  });

  it('reports explicitly excluded deleted SG, data-link, and control-link entities', async () => {
    const fixture = createFixture({
      deletedSgs: [30],
      deletedDataLinks: [dataLink(101, 10, 20)],
      deletedControlLinks: [controlLink(201, 30, 40)],
      requestedSubgraphSystemIds: [10, 20, 30, 40],
      explicitlyExcludedSubgraphSystemIds: [30],
      explicitlyExcludedDataLinkSystemIds: [101],
      explicitlyExcludedControlLinkSystemIds: [201],
    });

    const result = await runAnalysis(service, fixture);

    expect(result).toEqual({
      kind: RESULT_KIND.Fail,
      issues: [
        expect.objectContaining({
          code: 'ARC-ROUTING-PREVAL-EDIT-SCOPE-CONFLICT',
          message: expect.stringContaining(
            'Subgraphs marked for deletion were explicitly excluded: [30]',
          ),
        }),
      ],
    });
    expect(
      result.kind === RESULT_KIND.Fail && result.issues[0]?.message,
    ).toEqual(
      expect.stringContaining(
        'Data links marked for deletion were explicitly excluded: [101]',
      ),
    );
    expect(
      result.kind === RESULT_KIND.Fail && result.issues[0]?.message,
    ).toEqual(
      expect.stringContaining(
        'Control links marked for deletion were explicitly excluded: [201]',
      ),
    );
  });

  it('runs both gates in manual mode but emits no automatic deletion outputs', async () => {
    const currentUsecase = usecase(
      1,
      [1, 2, 3],
      [
        {sourceSubgraphSystemId: 1, destSubgraphSystemId: 2},
        {sourceSubgraphSystemId: 2, destSubgraphSystemId: 3},
      ],
    );
    const fixture = createFixture({
      mode: 'MANUAL',
      usecases: [currentUsecase],
      deletedDataLinks: [dataLink(101, 2, 3)],
      overlayDataLinks: [dataLink(102, 1, 2)],
      routableDataLinks: [dataLink(102, 1, 2)],
    });

    const result = await runAnalysis(service, fixture);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(fixture.context.deletionAnalysis).toEqual({
      affectedUsecaseSystemIds: new Set([1]),
      markedForDeletion: [],
      preservedUsecases: [],
      islandUseCaseCandidates: [],
      reconstructionPaths: [],
    });
    expect(fixture.context.warnings).toEqual([]);
  });

  it('preserves a multi-path usecase when only an isolated SG is deleted', async () => {
    const currentUsecase = usecase(
      1,
      [1, 2, 3],
      [{sourceSubgraphSystemId: 1, destSubgraphSystemId: 2}],
    );
    const fixture = createFixture({
      usecases: [currentUsecase],
      subgraphIds: [1, 2],
      deletedSgs: [3],
      overlayDataLinks: [dataLink(101, 1, 2)],
    });

    await runAnalysis(service, fixture);

    expect(fixture.context.deletionAnalysis?.markedForDeletion).toEqual([]);
    expect(fixture.context.deletionAnalysis?.preservedUsecases).toEqual([
      {usecase: currentUsecase, droppedSubgraphSystemIds: [3]},
    ]);
  });

  it('keeps a broken multi-path usecase marked without reconstruction', async () => {
    const currentUsecase = usecase(
      1,
      [1, 2, 3],
      [
        {sourceSubgraphSystemId: 1, destSubgraphSystemId: 2},
        {sourceSubgraphSystemId: 1, destSubgraphSystemId: 3},
      ],
    );
    const fixture = createFixture({
      usecases: [currentUsecase],
      subgraphIds: [1, 2],
      deletedSgs: [3],
      overlayDataLinks: [dataLink(101, 1, 2)],
    });

    await runAnalysis(service, fixture);

    expect(fixture.context.deletionAnalysis?.markedForDeletion).toEqual([
      {
        usecase: currentUsecase,
        deletedComponent: {
          type: DELETED_COMPONENT_TYPE.Subgraph,
          systemId: 3,
        },
      },
    ]);
    expect(fixture.context.deletionAnalysis?.reconstructionPaths).toEqual([]);
  });

  it('emits every bounded single-path reconstruction alternative', async () => {
    const currentUsecase = usecase(
      1,
      [1, 3],
      [{sourceSubgraphSystemId: 1, destSubgraphSystemId: 3}],
    );
    const fixture = createFixture({
      usecases: [currentUsecase],
      subgraphIds: [1, 2, 3, 4],
      deletedDataLinks: [dataLink(101, 1, 3)],
      overlayDataLinks: [
        dataLink(102, 1, 2),
        dataLink(103, 2, 3),
        dataLink(104, 1, 4),
        dataLink(105, 4, 3),
      ],
      routableDataLinks: [
        dataLink(102, 1, 2),
        dataLink(103, 2, 3),
        dataLink(104, 1, 4),
        dataLink(105, 4, 3),
      ],
    });

    await runAnalysis(service, fixture);

    expect(fixture.context.deletionAnalysis?.reconstructionPaths).toEqual([
      {originalUsecaseSystemId: 1, path: {subgraphSystemIds: [1, 2, 3]}},
      {originalUsecaseSystemId: 1, path: {subgraphSystemIds: [1, 4, 3]}},
    ]);
  });

  it('terminates cyclic reconstruction branches and marks an unreconstructable UC', async () => {
    const currentUsecase = usecase(
      1,
      [1, 3],
      [{sourceSubgraphSystemId: 1, destSubgraphSystemId: 3}],
    );
    const fixture = createFixture({
      usecases: [currentUsecase],
      subgraphIds: [1, 2, 3],
      deletedDataLinks: [dataLink(101, 1, 3)],
      overlayDataLinks: [dataLink(102, 1, 2), dataLink(103, 2, 1)],
      routableDataLinks: [dataLink(102, 1, 2), dataLink(103, 2, 1)],
    });

    await runAnalysis(service, fixture);

    expect(fixture.context.deletionAnalysis?.reconstructionPaths).toEqual([]);
    expect(fixture.context.deletionAnalysis?.markedForDeletion[0]).toEqual(
      expect.objectContaining({
        deletedComponent: {
          type: DELETED_COMPONENT_TYPE.DataLink,
          systemId: 101,
        },
      }),
    );
  });

  it('crosses an unchanged legacy EC boundary after loading endpoint baselines', async () => {
    const currentUsecase = usecase(
      1,
      [1, 2, 3, 4],
      [
        {sourceSubgraphSystemId: 1, destSubgraphSystemId: 2},
        {sourceSubgraphSystemId: 2, destSubgraphSystemId: 3},
        {sourceSubgraphSystemId: 3, destSubgraphSystemId: 4},
      ],
      'EC',
    );
    const fixture = createFixture({
      usecases: [currentUsecase],
      subgraphIds: [1, 2, 3, 4, 5],
      deletedDataLinks: [dataLink(101, 1, 2)],
      overlayDataLinks: [
        dataLink(102, 1, 5),
        dataLink(103, 5, 2),
        dataLink(104, 2, 3, true),
        dataLink(105, 3, 4),
      ],
      routableDataLinks: [
        dataLink(102, 1, 5),
        dataLink(103, 5, 2),
        dataLink(104, 2, 3, true),
        dataLink(105, 3, 4),
      ],
    });

    await runAnalysis(service, fixture);

    expect(fixture.findAll).not.toHaveBeenCalled();
    expect(fixture.getSgkvs).toHaveBeenCalledWith(1, [2, 3]);
    expect(fixture.context.deletionAnalysis?.reconstructionPaths).toEqual([
      {
        originalUsecaseSystemId: 1,
        path: {subgraphSystemIds: [1, 5, 2, 3, 4]},
      },
    ]);
  });

  it('keeps a changed legacy EC boundary closed after comparing endpoint SGKVs', async () => {
    const currentUsecase = usecase(
      1,
      [1, 2, 3, 4],
      [
        {sourceSubgraphSystemId: 1, destSubgraphSystemId: 2},
        {sourceSubgraphSystemId: 2, destSubgraphSystemId: 3},
        {sourceSubgraphSystemId: 3, destSubgraphSystemId: 4},
      ],
      'EC',
    );
    const selectedUsecase = new UseCase({
      systemId: 1,
      fileSystemId: 1,
      keyVector: {valueSystemIds: [99]},
      subgraphSystemIds: [1, 2, 3, 4],
      subgraphPairs: [
        {sourceSubgraphSystemId: 1, destSubgraphSystemId: 2},
        {sourceSubgraphSystemId: 2, destSubgraphSystemId: 3},
        {sourceSubgraphSystemId: 3, destSubgraphSystemId: 4},
      ],
      type: 'EC',
    });
    const fixture = createFixture({
      usecases: [currentUsecase],
      selectedUsecases: [selectedUsecase],
      subgraphIds: [1, 2, 3, 4, 5],
      deletedDataLinks: [dataLink(101, 1, 2)],
      overlayDataLinks: [
        dataLink(102, 1, 5),
        dataLink(103, 5, 2),
        dataLink(104, 2, 3, true),
        dataLink(105, 3, 4),
      ],
      routableDataLinks: [
        dataLink(102, 1, 5),
        dataLink(103, 5, 2),
        dataLink(104, 2, 3, true),
        dataLink(105, 3, 4),
      ],
      requestedSgkvsBySubgraph: {2: [[99]]},
    });

    await runAnalysis(service, fixture);

    expect(fixture.findAll).not.toHaveBeenCalled();
    expect(fixture.getSgkvs).toHaveBeenCalledWith(1, [2, 3]);
    expect(fixture.context.deletionAnalysis?.reconstructionPaths).toEqual([]);
    expect(fixture.context.deletionAnalysis?.markedForDeletion[0]).toEqual(
      expect.objectContaining({
        deletedComponent: {
          type: DELETED_COMPONENT_TYPE.DataLink,
          systemId: 101,
        },
      }),
    );
  });

  it('filters endpoint baselines by surviving selected UC values before crossing a legacy EC boundary', async () => {
    const legacyUsecase = usecase(
      1,
      [1, 2, 3, 4],
      [
        {sourceSubgraphSystemId: 1, destSubgraphSystemId: 2},
        {sourceSubgraphSystemId: 2, destSubgraphSystemId: 3},
        {sourceSubgraphSystemId: 3, destSubgraphSystemId: 4},
      ],
      'EC',
    );
    const survivingUsecase = usecase(
      2,
      [6, 7],
      [{sourceSubgraphSystemId: 6, destSubgraphSystemId: 7}],
      'LINKED',
      [10, 20],
    );
    const fixture = createFixture({
      usecases: [legacyUsecase, survivingUsecase],
      selectedUsecases: [legacyUsecase, survivingUsecase],
      subgraphIds: [1, 2, 3, 4, 5, 6, 7],
      deletedDataLinks: [dataLink(101, 1, 2)],
      overlayDataLinks: [
        dataLink(102, 1, 5),
        dataLink(103, 5, 2),
        dataLink(104, 2, 3, true),
        dataLink(105, 3, 4),
      ],
      routableDataLinks: [
        dataLink(102, 1, 5),
        dataLink(103, 5, 2),
        dataLink(104, 2, 3, true),
        dataLink(105, 3, 4),
      ],
      requestedSgkvsBySubgraph: {2: [[20, 10]], 3: [[20]]},
      sgkvs: [
        {
          sgSystemId: 2,
          sgkvSystemId: 200,
          keyValues: [
            {keyDefSystemId: 1, valueDefSystemId: 10},
            {keyDefSystemId: 2, valueDefSystemId: 20},
            {keyDefSystemId: 3, valueDefSystemId: 30},
          ],
        },
        {
          sgSystemId: 3,
          sgkvSystemId: 300,
          keyValues: [{keyDefSystemId: 2, valueDefSystemId: 20}],
        },
      ],
    });

    await runAnalysis(service, fixture);

    expect(fixture.getSgkvs).toHaveBeenCalledTimes(1);
    expect(fixture.getSgkvs).toHaveBeenCalledWith(1, [2, 3]);
    expect(fixture.context.deletionAnalysis?.reconstructionPaths).toEqual([
      {
        originalUsecaseSystemId: 1,
        path: {subgraphSystemIds: [1, 5, 2, 3, 4]},
      },
    ]);
  });

  it('does not load SGKV baselines in manual mode', async () => {
    const currentUsecase = usecase(
      1,
      [1, 2, 3, 4],
      [
        {sourceSubgraphSystemId: 1, destSubgraphSystemId: 2},
        {sourceSubgraphSystemId: 2, destSubgraphSystemId: 3},
        {sourceSubgraphSystemId: 3, destSubgraphSystemId: 4},
      ],
      'EC',
    );
    const fixture = createFixture({
      mode: 'MANUAL',
      usecases: [currentUsecase],
      deletedDataLinks: [dataLink(101, 1, 2)],
      overlayDataLinks: [dataLink(102, 2, 3, true), dataLink(103, 3, 4)],
    });

    await runAnalysis(service, fixture);

    expect(fixture.getSgkvs).not.toHaveBeenCalled();
  });
});
