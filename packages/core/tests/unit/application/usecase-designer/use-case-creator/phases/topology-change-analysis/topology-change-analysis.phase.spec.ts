/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {RESULT_KIND} from '../../../../../../../src/application/shared/result/result.js';
import {
  createAutoRoutingInput,
  createManualRoutingInput,
  emptyGraphEdits,
} from '../../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import {RoutingContext} from '../../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-context.js';
import {
  DELETED_COMPONENT_TYPE,
  type MdfPairSubstitution,
  PATH_TERMINATION,
  USECASE_TOPOLOGY_DECISION_KIND,
} from '../../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-state.js';
import {TopologyChangeAnalysisPhase} from '../../../../../../../src/application/usecase-designer/use-case-creator/phases/topology-change-analysis/topology-change-analysis.phase.js';
import {buildTopologyImpactInventory} from '../../../../../../../src/application/usecase-designer/use-case-creator/phases/topology-change-analysis/topology-impact-inventory.js';
import type {MdfSubstitutionAnalyzer} from '../../../../../../../src/application/usecase-designer/use-case-creator/phases/topology-change-analysis/mdf-substitution-analyzer.js';
import {UseCase} from '../../../../../../../src/domain/entities/usecase-data/usecase/usecase.js';
import type {ControlLink} from '../../../../../../../src/domain/entities/usecase-data/links/control-link.js';
import type {DataLink} from '../../../../../../../src/domain/entities/usecase-data/links/data-link.js';
import {DATA_LINK_TYPE} from '../../../../../../../src/domain/entities/usecase-data/links/data-link-type.js';
import type {
  SgkvEntry,
  SubgraphRepository,
} from '../../../../../../../src/application/ports/persistence/repositories/subgraph/subgraph.repository.js';

type UsecaseType = 'EC' | 'ISLAND' | 'LINKED';

interface FixtureOptions {
  readonly mode?: 'AUTO' | 'MANUAL';
  readonly usecases?: readonly UseCase[];
  readonly selectedUsecases?: readonly UseCase[];
  readonly subgraphIds?: readonly number[];
  readonly mdfSubgraphIds?: readonly number[];
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
    linkType: isEc ? DATA_LINK_TYPE.Ec : DATA_LINK_TYPE.Normal,
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
  const mdfSubgraphIds = new Set(options.mdfSubgraphIds ?? [3, 5]);
  const requestedSubgraphSystemIds =
    options.requestedSubgraphSystemIds ?? subgraphIds;
  const inputInit = {
    fileSystemId: 1,
    selection: {
      selectedUsecaseSystemIds: selectedUsecases.map(
        usecase => usecase.systemId,
      ),
      activeSubgraphs: requestedSubgraphSystemIds.map(systemId => ({
        systemId,
        sgkvs: options.requestedSgkvsBySubgraph?.[systemId] ?? [],
      })),
      excludedSubgraphSystemIds:
        options.explicitlyExcludedSubgraphSystemIds ?? [],
      excludedDataLinkSystemIds:
        options.explicitlyExcludedDataLinkSystemIds ?? [],
      excludedControlLinkSystemIds:
        options.explicitlyExcludedControlLinkSystemIds ?? [],
    },
    selectedUsecases,
    graphSnapshot: {
      subgraphs: subgraphIds.map(systemId => ({
        subgraph: {systemId} as never,
        requestedSgkvs: options.requestedSgkvsBySubgraph?.[systemId] ?? [],
        isMdf: mdfSubgraphIds.has(systemId),
      })),
      routableDataLinks,
      routableControlLinks,
      overlayDataLinks,
      overlayControlLinks,
      committedUsecases,
      sessionEdits,
    },
    activeManualUsecaseEdits: [],
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
  const subgraphRepository = {getSgkvs} as unknown as SubgraphRepository;
  return {context, subgraphRepository, findAll, getSgkvs};
}

function runAnalysis(
  service: TopologyChangeAnalysisPhase,
  fixture: ReturnType<typeof createFixture>,
) {
  return service.run(fixture.context, fixture.subgraphRepository);
}

describe('TopologyChangeAnalysisPhase', () => {
  const service = new TopologyChangeAnalysisPhase();

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
    expect(fixture.context.topologyChangeAnalysis).toEqual({
      affectedUsecaseSystemIds: new Set([1]),
      decisions: [
        {
          kind: USECASE_TOPOLOGY_DECISION_KIND.DeleteOrReconstruct,
          usecase: currentUsecase,
          deletedComponent: {
            type: DELETED_COMPONENT_TYPE.Subgraph,
            systemId: 10,
          },
          reconstructionPaths: [],
        },
      ],
    });
  });

  it('records one analyzer result as an aggregate MDF decision for a pure deleted pair', async () => {
    const currentUsecase = usecase(
      101,
      [10, 20],
      [{sourceSubgraphSystemId: 10, destSubgraphSystemId: 20}],
    );
    const deletedLink = dataLink(501, 10, 20);
    const substitution: MdfPairSubstitution = {
      removedPair: {
        sourceSubgraphSystemId: 10,
        destSubgraphSystemId: 20,
      },
      replacementSubgraphSystemIds: [30],
      replacementPairs: [
        {sourceSubgraphSystemId: 10, destSubgraphSystemId: 30},
        {sourceSubgraphSystemId: 30, destSubgraphSystemId: 20},
      ],
    };
    const analyze = jest.fn(() => substitution);
    const analyzer = {analyze} as unknown as MdfSubstitutionAnalyzer;
    const phase = new TopologyChangeAnalysisPhase(
      undefined,
      undefined,
      analyzer,
    );
    const fixture = createFixture({
      usecases: [currentUsecase],
      subgraphIds: [10, 20, 30],
      deletedDataLinks: [deletedLink],
      routableDataLinks: [dataLink(502, 10, 30), dataLink(503, 30, 20)],
    });

    const result = await runAnalysis(phase, fixture);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(analyze).toHaveBeenCalledWith(
      deletedLink,
      expect.objectContaining({
        committedUsecasesByDirectedPair: expect.any(Map),
      }),
    );
    expect(fixture.context.topologyChangeAnalysis).toEqual({
      affectedUsecaseSystemIds: new Set(),
      decisions: [
        {
          kind: USECASE_TOPOLOGY_DECISION_KIND.MdfSubstitution,
          usecase: currentUsecase,
          substitutions: [substitution],
          structuralChange: {
            addedSubgraphSystemIds: [30],
            removedSubgraphSystemIds: [],
            addedPairs: substitution.replacementPairs,
            removedPairs: [substitution.removedPair],
            resultingSubgraphSystemIds: [10, 20, 30],
            resultingPairs: substitution.replacementPairs,
            resultingType: currentUsecase.type,
            sgkvAssignments: [
              {subgraphSystemId: 30, valueDefinitionSystemIds: []},
            ],
          },
        },
      ],
    });
  });

  it('does not require selection for an unselected pure MDF usecase', async () => {
    const currentUsecase = usecase(
      104,
      [1, 5],
      [{sourceSubgraphSystemId: 1, destSubgraphSystemId: 5}],
    );
    const fixture = createFixture({
      usecases: [currentUsecase],
      selectedUsecases: [],
      deletedDataLinks: [dataLink(801, 1, 5)],
      overlayDataLinks: [dataLink(802, 1, 3), dataLink(803, 3, 5)],
      routableDataLinks: [dataLink(802, 1, 3), dataLink(803, 3, 5)],
    });

    const result = await runAnalysis(service, fixture);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(fixture.context.topologyChangeAnalysis).toEqual(
      expect.objectContaining({
        affectedUsecaseSystemIds: new Set(),
        decisions: [
          expect.objectContaining({
            kind: USECASE_TOPOLOGY_DECISION_KIND.MdfSubstitution,
            usecase: currentUsecase,
          }),
        ],
      }),
    );
  });

  it.each(['AUTO', 'MANUAL'] as const)(
    'retains a pure MDF decision without selection in %s mode',
    async mode => {
      const currentUsecase = usecase(
        105,
        [1, 5],
        [{sourceSubgraphSystemId: 1, destSubgraphSystemId: 5}],
      );
      const fixture = createFixture({
        mode,
        usecases: [currentUsecase],
        selectedUsecases: [],
        deletedDataLinks: [dataLink(811, 1, 5)],
        overlayDataLinks: [dataLink(812, 1, 3), dataLink(813, 3, 5)],
        routableDataLinks: [dataLink(812, 1, 3), dataLink(813, 3, 5)],
      });

      const result = await runAnalysis(service, fixture);

      expect(result.kind).toBe(RESULT_KIND.Ok);
      expect(
        fixture.context.topologyChangeAnalysis?.affectedUsecaseSystemIds,
      ).toEqual(new Set());
      expect(fixture.context.topologyChangeAnalysis?.decisions).toEqual([
        expect.objectContaining({
          kind: USECASE_TOPOLOGY_DECISION_KIND.MdfSubstitution,
          usecase: currentUsecase,
        }),
      ]);
      expect(fixture.context.warnings).toEqual([]);
    },
  );

  it('derives DEL-02 from every finalized ordinary decision', async () => {
    const preservedUsecase = usecase(
      102,
      [1, 2, 3],
      [{sourceSubgraphSystemId: 1, destSubgraphSystemId: 2}],
    );
    const islandUsecase = usecase(
      103,
      [10, 20],
      [{sourceSubgraphSystemId: 10, destSubgraphSystemId: 20}],
    );
    const deletedUsecase = usecase(
      104,
      [30, 40],
      [{sourceSubgraphSystemId: 30, destSubgraphSystemId: 40}],
    );
    const fixture = createFixture({
      usecases: [preservedUsecase, islandUsecase, deletedUsecase],
      selectedUsecases: [],
      deletedSgs: [3],
      deletedDataLinks: [dataLink(821, 10, 20), dataLink(822, 30, 40)],
      overlayControlLinks: [controlLink(823, 10, 20)],
    });

    const result = await runAnalysis(service, fixture);

    expect(result).toEqual({
      kind: RESULT_KIND.Fail,
      issues: [
        expect.objectContaining({
          code: 'ARC-ROUTING-DEL-02',
          message: expect.stringContaining('[102, 103, 104]'),
        }),
      ],
    });
    expect(fixture.context.topologyChangeAnalysis).toBeNull();
  });

  it('merges compatible analyzer results into one structural MDF change', async () => {
    const currentUsecase = usecase(
      102,
      [10, 20, 40],
      [
        {sourceSubgraphSystemId: 10, destSubgraphSystemId: 20},
        {sourceSubgraphSystemId: 20, destSubgraphSystemId: 40},
      ],
    );
    const firstDeletedLink = dataLink(601, 10, 20);
    const secondDeletedLink = dataLink(602, 20, 40);
    const substitutions = new Map<number, MdfPairSubstitution>([
      [
        601,
        {
          removedPair: {
            sourceSubgraphSystemId: 10,
            destSubgraphSystemId: 20,
          },
          replacementSubgraphSystemIds: [15],
          replacementPairs: [
            {sourceSubgraphSystemId: 10, destSubgraphSystemId: 15},
            {sourceSubgraphSystemId: 15, destSubgraphSystemId: 20},
          ],
        },
      ],
      [
        602,
        {
          removedPair: {
            sourceSubgraphSystemId: 20,
            destSubgraphSystemId: 40,
          },
          replacementSubgraphSystemIds: [30],
          replacementPairs: [
            {sourceSubgraphSystemId: 20, destSubgraphSystemId: 30},
            {sourceSubgraphSystemId: 30, destSubgraphSystemId: 40},
          ],
        },
      ],
    ]);
    const analyze = jest.fn(
      (link: DataLink) => substitutions.get(link.systemId) ?? null,
    );
    const phase = new TopologyChangeAnalysisPhase(undefined, undefined, {
      analyze,
    } as unknown as MdfSubstitutionAnalyzer);
    const fixture = createFixture({
      usecases: [currentUsecase],
      subgraphIds: [10, 15, 20, 30, 40],
      deletedDataLinks: [firstDeletedLink, secondDeletedLink],
      routableDataLinks: [
        dataLink(603, 10, 15),
        dataLink(604, 15, 20),
        dataLink(605, 20, 30),
        dataLink(606, 30, 40),
      ],
    });

    await runAnalysis(phase, fixture);

    expect(analyze).toHaveBeenCalledTimes(2);
    expect(fixture.context.topologyChangeAnalysis?.decisions).toEqual([
      expect.objectContaining({
        kind: USECASE_TOPOLOGY_DECISION_KIND.MdfSubstitution,
        usecase: currentUsecase,
        structuralChange: expect.objectContaining({
          addedSubgraphSystemIds: [15, 30],
          removedPairs: [
            {sourceSubgraphSystemId: 10, destSubgraphSystemId: 20},
            {sourceSubgraphSystemId: 20, destSubgraphSystemId: 40},
          ],
          addedPairs: [
            {sourceSubgraphSystemId: 10, destSubgraphSystemId: 15},
            {sourceSubgraphSystemId: 15, destSubgraphSystemId: 20},
            {sourceSubgraphSystemId: 20, destSubgraphSystemId: 30},
            {sourceSubgraphSystemId: 30, destSubgraphSystemId: 40},
          ],
          resultingSubgraphSystemIds: [10, 15, 20, 30, 40],
        }),
      }),
    ]);
  });

  it('falls back to ordinary deletion when one removed pair has conflicting chains', async () => {
    const currentUsecase = usecase(
      103,
      [10, 20],
      [{sourceSubgraphSystemId: 10, destSubgraphSystemId: 20}],
    );
    const firstDeletedLink = dataLink(701, 10, 20);
    const secondDeletedLink = dataLink(702, 10, 20);
    const analyze = jest.fn(
      (link: DataLink): MdfPairSubstitution => ({
        removedPair: {
          sourceSubgraphSystemId: 10,
          destSubgraphSystemId: 20,
        },
        replacementSubgraphSystemIds: [link.systemId === 701 ? 15 : 16],
        replacementPairs: [
          {
            sourceSubgraphSystemId: 10,
            destSubgraphSystemId: link.systemId === 701 ? 15 : 16,
          },
          {
            sourceSubgraphSystemId: link.systemId === 701 ? 15 : 16,
            destSubgraphSystemId: 20,
          },
        ],
      }),
    );
    const phase = new TopologyChangeAnalysisPhase(undefined, undefined, {
      analyze,
    } as unknown as MdfSubstitutionAnalyzer);
    const fixture = createFixture({
      usecases: [currentUsecase],
      subgraphIds: [10, 15, 16, 20],
      deletedDataLinks: [firstDeletedLink, secondDeletedLink],
    });

    await runAnalysis(phase, fixture);

    expect(fixture.context.topologyChangeAnalysis?.decisions).toEqual([
      expect.objectContaining({
        kind: USECASE_TOPOLOGY_DECISION_KIND.DeleteOrReconstruct,
        usecase: currentUsecase,
        deletedComponent: {
          type: DELETED_COMPONENT_TYPE.DataLink,
          systemId: 701,
        },
      }),
    ]);
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

    expect(fixture.context.topologyChangeAnalysis).toEqual({
      affectedUsecaseSystemIds: new Set(),
      decisions: [],
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
    expect(fixture.context.topologyChangeAnalysis).toEqual({
      affectedUsecaseSystemIds: new Set([1]),
      decisions: [
        {
          kind: USECASE_TOPOLOGY_DECISION_KIND.TransitionToIsland,
          usecase: currentUsecase,
          dataLinkLossPairs: [
            {
              sourceSubgraphSystemId: 10,
              destSubgraphSystemId: 20,
              deletedDataLinkSystemId: 101,
            },
          ],
          droppedSubgraphSystemIds: [],
        },
      ],
    });
    expect(fixture.context.warnings).toEqual([
      expect.objectContaining({
        code: 'ARC-ROUTING-UC-AUTO-ISLAND',
        impactedEntity: expect.objectContaining({systemId: 1}),
      }),
    ]);
  });

  it('does not transition an ISLAND usecase for control-only survival', async () => {
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

    expect(
      fixture.context.topologyChangeAnalysis?.affectedUsecaseSystemIds,
    ).toEqual(new Set());
    expect(fixture.context.topologyChangeAnalysis?.decisions).toEqual([]);
    expect(fixture.context.warnings).toEqual([]);
  });

  it('merges isolated-member preservation into one degradation decision', async () => {
    const currentUsecase = usecase(
      100,
      [1, 2, 3, 4],
      [
        {sourceSubgraphSystemId: 1, destSubgraphSystemId: 2},
        {sourceSubgraphSystemId: 1, destSubgraphSystemId: 3},
      ],
    );
    const fixture = createFixture({
      usecases: [currentUsecase],
      subgraphIds: [1, 2, 3, 4],
      deletedSgs: [4],
      deletedDataLinks: [dataLink(10, 1, 2)],
      overlayControlLinks: [controlLink(20, 1, 2)],
      overlayDataLinks: [dataLink(30, 1, 3)],
    });

    const result = await runAnalysis(service, fixture);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(fixture.context.topologyChangeAnalysis?.decisions).toHaveLength(1);
    expect(fixture.context.topologyChangeAnalysis?.decisions[0]).toMatchObject({
      kind: 'TRANSITION_TO_ISLAND',
      usecase: {systemId: 100},
      droppedSubgraphSystemIds: [4],
      dataLinkLossPairs: [
        {
          sourceSubgraphSystemId: 1,
          destSubgraphSystemId: 2,
          deletedDataLinkSystemId: 10,
        },
      ],
    });
    expect(
      fixture.context.topologyChangeAnalysis?.affectedUsecaseSystemIds,
    ).toEqual(new Set([100]));
  });

  it('keeps ordinary control-only degradation separate from MDF analysis', async () => {
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

    expect(
      fixture.context.topologyChangeAnalysis?.affectedUsecaseSystemIds,
    ).toEqual(new Set([1]));
    expect(fixture.context.topologyChangeAnalysis?.decisions[0]).toEqual(
      expect.objectContaining({
        kind: USECASE_TOPOLOGY_DECISION_KIND.TransitionToIsland,
        dataLinkLossPairs: [
          {
            sourceSubgraphSystemId: 1,
            destSubgraphSystemId: 2,
            deletedDataLinkSystemId: 101,
          },
        ],
      }),
    );
  });

  it.each([
    {
      name: 'normal physical link has the lower system ID',
      normalLinkSystemId: 20,
      ecLinkSystemId: 30,
    },
    {
      name: 'EC physical link has the lower system ID',
      normalLinkSystemId: 30,
      ecLinkSystemId: 20,
    },
  ])(
    'rejects mixed-semantic replacement regardless of physical link ordering: $name',
    async ({normalLinkSystemId, ecLinkSystemId}) => {
      const currentUsecase = usecase(
        100,
        [1, 2],
        [{sourceSubgraphSystemId: 1, destSubgraphSystemId: 2}],
      );
      const fixture = createFixture({
        usecases: [currentUsecase],
        subgraphIds: [1, 2, 3],
        mdfSubgraphIds: [3],
        deletedDataLinks: [dataLink(10, 1, 2)],
        routableDataLinks: [
          dataLink(normalLinkSystemId, 1, 3),
          dataLink(ecLinkSystemId, 1, 3, true),
          dataLink(40, 3, 2),
        ],
      });

      const result = await runAnalysis(service, fixture);

      expect(result.kind).toBe(RESULT_KIND.Ok);
      expect(
        fixture.context.topologyChangeAnalysis?.decisions.filter(
          decision => decision.kind === 'MDF_SUBSTITUTION',
        ),
      ).toHaveLength(0);
      expect(
        fixture.context.topologyChangeAnalysis?.decisions.filter(
          decision => decision.kind === 'DELETE_OR_RECONSTRUCT',
        ),
      ).toHaveLength(1);
      expect(
        fixture.context.topologyChangeAnalysis?.affectedUsecaseSystemIds,
      ).toEqual(new Set([100]));
    },
  );

  it.each([
    {
      name: 'LINKED UC whose deleted EC pair would project to EC',
      storedType: 'LINKED' as const,
      deletedLinkIsEc: true,
      replacementIsEc: true,
    },
    {
      name: 'ISLAND UC whose normal replacement would project to LINKED',
      storedType: 'ISLAND' as const,
      deletedLinkIsEc: false,
      replacementIsEc: false,
    },
  ])(
    'falls back when MDF changes the committed type: $name',
    async scenario => {
      const currentUsecase = usecase(
        110,
        [1, 2],
        [{sourceSubgraphSystemId: 1, destSubgraphSystemId: 2}],
        scenario.storedType,
      );
      const fixture = createFixture({
        usecases: [currentUsecase],
        subgraphIds: [1, 2, 3],
        mdfSubgraphIds: [3],
        deletedDataLinks: [dataLink(10, 1, 2, scenario.deletedLinkIsEc)],
        routableDataLinks: [
          dataLink(20, 1, 3, scenario.replacementIsEc),
          dataLink(30, 3, 2, scenario.replacementIsEc),
        ],
      });

      const result = await runAnalysis(service, fixture);

      expect(result.kind).toBe(RESULT_KIND.Ok);
      expect(
        fixture.context.topologyChangeAnalysis?.decisions.filter(
          decision => decision.kind === 'MDF_SUBSTITUTION',
        ),
      ).toHaveLength(0);
      expect(fixture.context.topologyChangeAnalysis?.decisions).toEqual([
        expect.objectContaining({
          kind: USECASE_TOPOLOGY_DECISION_KIND.DeleteOrReconstruct,
          usecase: currentUsecase,
        }),
      ]);
      expect(
        fixture.context.topologyChangeAnalysis?.affectedUsecaseSystemIds,
      ).toEqual(new Set([110]));
    },
  );

  it('falls back when an EC replacement would leave a second logical EC crossing', async () => {
    const currentUsecase = usecase(
      111,
      [1, 2, 3, 4, 5],
      [
        {sourceSubgraphSystemId: 1, destSubgraphSystemId: 2},
        {sourceSubgraphSystemId: 4, destSubgraphSystemId: 5},
      ],
      'EC',
    );
    const fixture = createFixture({
      usecases: [currentUsecase],
      subgraphIds: [1, 2, 3, 4, 5],
      mdfSubgraphIds: [3],
      deletedDataLinks: [dataLink(10, 1, 2, true)],
      routableDataLinks: [
        dataLink(20, 1, 3, true),
        dataLink(30, 3, 2, true),
        dataLink(40, 4, 5, true),
      ],
    });

    const result = await runAnalysis(service, fixture);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(fixture.context.topologyChangeAnalysis?.decisions).toEqual([
      expect.objectContaining({
        kind: USECASE_TOPOLOGY_DECISION_KIND.DeleteOrReconstruct,
        usecase: currentUsecase,
      }),
    ]);
    expect(
      fixture.context.topologyChangeAnalysis?.affectedUsecaseSystemIds,
    ).toEqual(new Set([111]));
  });

  it('counts one multi-hop EC replacement chain as one logical crossing', async () => {
    const currentUsecase = usecase(
      112,
      [1, 2],
      [{sourceSubgraphSystemId: 1, destSubgraphSystemId: 2}],
      'EC',
    );
    const fixture = createFixture({
      usecases: [currentUsecase],
      subgraphIds: [1, 2, 3, 4],
      mdfSubgraphIds: [3, 4],
      deletedDataLinks: [dataLink(10, 1, 2, true)],
      routableDataLinks: [
        dataLink(20, 1, 3, true),
        dataLink(30, 3, 4, true),
        dataLink(40, 4, 2, true),
      ],
    });

    const result = await runAnalysis(service, fixture);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(fixture.context.topologyChangeAnalysis?.decisions).toEqual([
      expect.objectContaining({
        kind: USECASE_TOPOLOGY_DECISION_KIND.MdfSubstitution,
        usecase: currentUsecase,
      }),
    ]);
    expect(
      fixture.context.topologyChangeAnalysis?.affectedUsecaseSystemIds,
    ).toEqual(new Set());
  });

  it('indexes committed usecases by exact stored direction', async () => {
    const forward = usecase(
      101,
      [10, 20],
      [{sourceSubgraphSystemId: 10, destSubgraphSystemId: 20}],
    );
    const reverse = usecase(
      102,
      [20, 10],
      [{sourceSubgraphSystemId: 20, destSubgraphSystemId: 10}],
    );
    const fixture = createFixture({
      usecases: [forward, reverse],
      deletedDataLinks: [dataLink(900, 10, 20)],
    });

    await runAnalysis(service, fixture);

    expect(fixture.context.topologyChangeAnalysis?.decisions).toEqual([
      expect.objectContaining({
        kind: USECASE_TOPOLOGY_DECISION_KIND.DeleteOrReconstruct,
        usecase: forward,
      }),
    ]);
  });

  it('uses unordered support but directed routable adjacency', () => {
    const currentUsecase = usecase(
      101,
      [10, 20],
      [{sourceSubgraphSystemId: 10, destSubgraphSystemId: 20}],
    );
    const fixture = createFixture({
      usecases: [currentUsecase],
      subgraphIds: [10, 20, 30],
      overlayControlLinks: [controlLink(901, 20, 10)],
      routableDataLinks: [dataLink(902, 10, 30), dataLink(903, 30, 20)],
    });

    const topology = buildTopologyImpactInventory(
      fixture.context.input.graphSnapshot,
    );

    expect(topology.survivingControlLinkPairKeys).toEqual(new Set(['10<->20']));
    expect(topology.routableAdjacency.get(10)).toEqual([
      {destSubgraphSystemId: 30, isEc: false},
    ]);
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
    expect(fixture.context.topologyChangeAnalysis).toBeNull();
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
    expect(
      fixture.context.topologyChangeAnalysis?.affectedUsecaseSystemIds,
    ).toEqual(new Set());
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

  it('retains ordinary decisions in manual mode without automatic reconstruction output', async () => {
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
    expect(fixture.context.topologyChangeAnalysis).toEqual({
      affectedUsecaseSystemIds: new Set([1]),
      decisions: [
        expect.objectContaining({
          kind: USECASE_TOPOLOGY_DECISION_KIND.DeleteOrReconstruct,
          usecase: currentUsecase,
          deletedComponent: {
            type: DELETED_COMPONENT_TYPE.DataLink,
            systemId: 101,
          },
          reconstructionPaths: [],
        }),
      ],
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

    expect(fixture.context.topologyChangeAnalysis?.decisions).toEqual([
      {
        kind: USECASE_TOPOLOGY_DECISION_KIND.Preserve,
        usecase: currentUsecase,
        droppedSubgraphSystemIds: [3],
      },
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

    expect(fixture.context.topologyChangeAnalysis?.decisions).toEqual([
      {
        kind: USECASE_TOPOLOGY_DECISION_KIND.DeleteOrReconstruct,
        usecase: currentUsecase,
        deletedComponent: {
          type: DELETED_COMPONENT_TYPE.Subgraph,
          systemId: 3,
        },
        reconstructionPaths: [],
      },
    ]);
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

    expect(fixture.context.topologyChangeAnalysis?.decisions[0]).toEqual({
      kind: USECASE_TOPOLOGY_DECISION_KIND.DeleteOrReconstruct,
      usecase: currentUsecase,
      deletedComponent: {
        type: DELETED_COMPONENT_TYPE.DataLink,
        systemId: 101,
      },
      reconstructionPaths: [
        {
          subgraphSystemIds: [1, 2, 3],
          termination: PATH_TERMINATION.NaturalLeaf,
          ecBoundaryLinkId: null,
        },
        {
          subgraphSystemIds: [1, 4, 3],
          termination: PATH_TERMINATION.NaturalLeaf,
          ecBoundaryLinkId: null,
        },
      ],
    });
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

    expect(fixture.context.topologyChangeAnalysis?.decisions[0]).toEqual(
      expect.objectContaining({
        kind: USECASE_TOPOLOGY_DECISION_KIND.DeleteOrReconstruct,
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
    expect(fixture.context.topologyChangeAnalysis?.decisions[0]).toEqual({
      kind: USECASE_TOPOLOGY_DECISION_KIND.DeleteOrReconstruct,
      usecase: currentUsecase,
      deletedComponent: {
        type: DELETED_COMPONENT_TYPE.DataLink,
        systemId: 101,
      },
      reconstructionPaths: [
        {
          subgraphSystemIds: [1, 5, 2, 3, 4],
          termination: PATH_TERMINATION.NaturalLeaf,
          ecBoundaryLinkId: null,
        },
      ],
    });
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
    expect(fixture.context.topologyChangeAnalysis?.decisions[0]).toEqual(
      expect.objectContaining({
        kind: USECASE_TOPOLOGY_DECISION_KIND.DeleteOrReconstruct,
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
    expect(fixture.context.topologyChangeAnalysis?.decisions[0]).toEqual({
      kind: USECASE_TOPOLOGY_DECISION_KIND.DeleteOrReconstruct,
      usecase: legacyUsecase,
      deletedComponent: {
        type: DELETED_COMPONENT_TYPE.DataLink,
        systemId: 101,
      },
      reconstructionPaths: [
        {
          subgraphSystemIds: [1, 5, 2, 3, 4],
          termination: PATH_TERMINATION.NaturalLeaf,
          ecBoundaryLinkId: null,
        },
      ],
    });
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

  it('publishes one stable decision per impacted committed UC across every outcome', async () => {
    const mdfOnly = usecase(
      101,
      [10, 20],
      [{sourceSubgraphSystemId: 10, destSubgraphSystemId: 20}],
    );
    const preserved = usecase(
      102,
      [40, 50, 60],
      [{sourceSubgraphSystemId: 40, destSubgraphSystemId: 50}],
    );
    const island = usecase(
      103,
      [70, 80],
      [{sourceSubgraphSystemId: 70, destSubgraphSystemId: 80}],
    );
    const reconstruct = usecase(
      104,
      [90, 100],
      [{sourceSubgraphSystemId: 90, destSubgraphSystemId: 100}],
    );
    const incompleteMdf = usecase(
      105,
      [110, 120, 130],
      [
        {sourceSubgraphSystemId: 110, destSubgraphSystemId: 120},
        {sourceSubgraphSystemId: 120, destSubgraphSystemId: 130},
      ],
    );
    const benignSupport = usecase(
      106,
      [140, 150],
      [{sourceSubgraphSystemId: 140, destSubgraphSystemId: 150}],
    );
    const originalTopology = [
      ...mdfOnly.subgraphSystemIds,
      ...preserved.subgraphSystemIds,
      ...island.subgraphSystemIds,
      ...reconstruct.subgraphSystemIds,
      ...incompleteMdf.subgraphSystemIds,
      ...benignSupport.subgraphSystemIds,
    ];
    const fixture = createFixture({
      usecases: [
        reconstruct,
        benignSupport,
        mdfOnly,
        incompleteMdf,
        island,
        preserved,
      ],
      selectedUsecases: [preserved, island, reconstruct, incompleteMdf],
      subgraphIds: [...new Set([...originalTopology, 30, 35])],
      mdfSubgraphIds: [30, 35],
      deletedSgs: [60],
      deletedDataLinks: [
        dataLink(1001, 10, 20),
        dataLink(1002, 70, 80),
        dataLink(1003, 90, 100),
        dataLink(1004, 110, 120),
        dataLink(1005, 120, 130),
        dataLink(1006, 140, 150),
      ],
      overlayDataLinks: [
        dataLink(1009, 40, 50),
        dataLink(1010, 10, 30),
        dataLink(1011, 30, 20),
        dataLink(1012, 110, 35),
        dataLink(1013, 35, 120),
        dataLink(1014, 140, 150),
      ],
      routableDataLinks: [
        dataLink(1009, 40, 50),
        dataLink(1010, 10, 30),
        dataLink(1011, 30, 20),
        dataLink(1012, 110, 35),
        dataLink(1013, 35, 120),
        dataLink(1014, 140, 150),
      ],
      overlayControlLinks: [controlLink(1020, 70, 80)],
    });

    const result = await runAnalysis(service, fixture);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(
      fixture.context.topologyChangeAnalysis?.decisions.map(decision => [
        decision.usecase.systemId,
        decision.kind,
      ]),
    ).toEqual([
      [101, USECASE_TOPOLOGY_DECISION_KIND.MdfSubstitution],
      [102, USECASE_TOPOLOGY_DECISION_KIND.Preserve],
      [103, USECASE_TOPOLOGY_DECISION_KIND.TransitionToIsland],
      [104, USECASE_TOPOLOGY_DECISION_KIND.DeleteOrReconstruct],
      [105, USECASE_TOPOLOGY_DECISION_KIND.DeleteOrReconstruct],
    ]);
    expect(
      fixture.context.topologyChangeAnalysis?.affectedUsecaseSystemIds,
    ).toEqual(new Set([102, 103, 104, 105]));
    expect(fixture.context.topologyChangeAnalysis?.decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          usecase: mdfOnly,
          kind: USECASE_TOPOLOGY_DECISION_KIND.MdfSubstitution,
        }),
        expect.objectContaining({
          usecase: preserved,
          kind: USECASE_TOPOLOGY_DECISION_KIND.Preserve,
          droppedSubgraphSystemIds: [60],
        }),
        expect.objectContaining({
          usecase: island,
          kind: USECASE_TOPOLOGY_DECISION_KIND.TransitionToIsland,
        }),
        expect.objectContaining({
          usecase: reconstruct,
          kind: USECASE_TOPOLOGY_DECISION_KIND.DeleteOrReconstruct,
          reconstructionPaths: [],
        }),
        expect.objectContaining({
          usecase: incompleteMdf,
          kind: USECASE_TOPOLOGY_DECISION_KIND.DeleteOrReconstruct,
          reconstructionPaths: [],
        }),
      ]),
    );
    expect(fixture.context.warnings).toHaveLength(1);
    expect(fixture.context.warnings[0]).toEqual(
      expect.objectContaining({
        code: 'ARC-ROUTING-UC-AUTO-ISLAND',
        impactedEntity: expect.objectContaining({systemId: 103}),
      }),
    );
    expect(mdfOnly.subgraphSystemIds).toEqual([10, 20]);
    expect(mdfOnly.subgraphPairs).toEqual([
      {sourceSubgraphSystemId: 10, destSubgraphSystemId: 20},
    ]);
  });

  it('uses only snapshot evidence plus the conditional legacy EC baseline read', async () => {
    const currentUsecase = usecase(
      107,
      [1, 2],
      [{sourceSubgraphSystemId: 1, destSubgraphSystemId: 2}],
    );
    const fixture = createFixture({
      usecases: [currentUsecase],
      selectedUsecases: [],
      deletedDataLinks: [dataLink(1101, 1, 2)],
      overlayDataLinks: [dataLink(1102, 1, 3), dataLink(1103, 3, 2)],
      routableDataLinks: [dataLink(1102, 1, 3), dataLink(1103, 3, 2)],
      mdfSubgraphIds: [3],
    });
    fixture.getSgkvs.mockImplementation(() => {
      throw new Error('non-EC Phase 2 must not read SGKVs');
    });

    const result = await runAnalysis(service, fixture);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(fixture.getSgkvs).not.toHaveBeenCalled();
  });
});
