/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Result} from '../../../../../../../src/application/shared/result/result.js';
import type {ActiveManualUsecaseEdit} from '../../../../../../../src/application/ports/persistence/repositories/usecase/usecase.repository.js';
import type {KvPair} from '../../../../../../../src/application/ports/persistence/repositories/shared/kv-pair.js';
import {RoutingContext} from '../../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-context.js';
import {
  createAutoRoutingInput,
  createManualRoutingInput,
  emptyGraphEdits,
} from '../../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import type {
  RoutingInput,
  RoutingSubgraph,
} from '../../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import type {SameGkvCollision} from '../../../../../../../src/application/usecase-designer/use-case-creator/contracts/same-gkv-collision.js';
import type {
  RoutingCombination,
  UsecaseTopologyDecision,
} from '../../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-state.js';
import {RoutingEngine} from '../../../../../../../src/application/usecase-designer/use-case-creator/engine/routing-engine.js';
import {PreValidationService} from '../../../../../../../src/application/usecase-designer/use-case-creator/phases/pre-validation.service.js';
import {TopologyChangeAnalysisService} from '../../../../../../../src/application/usecase-designer/use-case-creator/phases/topology-change-analysis.service.js';
import {IslandTransitionService} from '../../../../../../../src/application/usecase-designer/use-case-creator/phases/island-transition.service.js';
import {KvResolutionService} from '../../../../../../../src/application/usecase-designer/use-case-creator/phases/kv-resolution.service.js';
import {SeedDetectionService} from '../../../../../../../src/application/usecase-designer/use-case-creator/phases/seed-detection.service.js';
import {ConeComputationService} from '../../../../../../../src/application/usecase-designer/use-case-creator/phases/cone-computation.service.js';
import {DfsRoutingService} from '../../../../../../../src/application/usecase-designer/use-case-creator/phases/dfs-routing.service.js';
import {CombinationExpansionService} from '../../../../../../../src/application/usecase-designer/use-case-creator/phases/combination-expansion.service.js';
import {ClassificationService} from '../../../../../../../src/application/usecase-designer/use-case-creator/phases/classification.service.js';
import {OrphanValidationService} from '../../../../../../../src/application/usecase-designer/use-case-creator/phases/orphan-validation.service.js';
import {RoutingChangeStager} from '../../../../../../../src/application/usecase-designer/use-case-creator/phases/routing-change-stager.js';
import {ResponseBuilder} from '../../../../../../../src/application/usecase-designer/use-case-creator/phases/response-builder.js';
import {RoutingIssueFactory} from '../../../../../../../src/application/usecase-designer/use-case-creator/issues/routing-issue-factory.js';
import {Subgraph} from '../../../../../../../src/domain/entities/usecase-data/subgraph/subgraph.js';
import {DataLink} from '../../../../../../../src/domain/entities/usecase-data/links/data-link.js';
import {DATA_LINK_TYPE} from '../../../../../../../src/domain/entities/usecase-data/links/data-link-type.js';
import {UseCase} from '../../../../../../../src/domain/entities/usecase-data/usecase/usecase.js';

export interface CommittedUsecaseTopology {
  readonly systemId: number;
  readonly members: readonly number[];
  readonly pairs: readonly (readonly [number, number])[];
  readonly gkv: readonly (readonly [number, number])[];
  readonly type: string;
}

export interface RoutingPair {
  readonly systemId: number;
  readonly sourceSubgraphSystemId: number;
  readonly destSubgraphSystemId: number;
  readonly linkType: string;
}

export interface UsecaseTopology {
  readonly usecaseSystemId: number;
  readonly members: readonly number[];
  readonly pairs: readonly (readonly [number, number])[];
  readonly type: string;
}

export interface MdfSubstitutionScenario {
  readonly mode: 'AUTOMATIC' | 'MANUAL';
  readonly selectedUsecaseSystemIds: readonly number[];
  readonly committedUsecases: readonly CommittedUsecaseTopology[];
  readonly newlyStagedUsecases?: readonly CommittedUsecaseTopology[];
  readonly subgraphs: readonly RoutingSubgraph[];
  readonly committedPairs: readonly RoutingPair[];
  readonly addedPairs: readonly RoutingPair[];
  readonly deletedPairs: readonly RoutingPair[];
  readonly deletedSubgraphSystemIds?: readonly number[];
  readonly activeManualUsecaseEdits?: readonly ActiveManualUsecaseEdit[];
  readonly dfsCandidates?: readonly RoutingCombination[];
  readonly failClassification?: boolean;
  readonly requestedSgkvsBySubgraph?: Readonly<
    Record<number, readonly (readonly number[])[]>
  >;
}

export type MdfSubstitutionScenarioBody = Omit<
  MdfSubstitutionScenario,
  'mode' | 'selectedUsecaseSystemIds'
>;

export function committedUsecase(
  input: CommittedUsecaseTopology,
): CommittedUsecaseTopology {
  return {
    ...input,
    members: [...input.members],
    pairs: input.pairs.map(pair => [...pair] as readonly [number, number]),
    gkv: input.gkv.map(pair => [...pair] as readonly [number, number]),
  };
}

export function subgraph(
  systemId: number,
  options: {readonly isMdf?: boolean} = {},
): RoutingSubgraph {
  return {
    subgraph: new Subgraph({
      systemId,
      naturalId: systemId,
      name: `sg-${systemId}`,
      isImported: false,
      fileSystemId: 1,
    }),
    requestedSgkvs: [],
    isMdf: options.isMdf ?? false,
  };
}

export function pair(
  systemId: number,
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
  linkType: string = DATA_LINK_TYPE.Normal,
): RoutingPair {
  return {
    systemId,
    sourceSubgraphSystemId,
    destSubgraphSystemId,
    linkType,
  };
}

function toDataLink(link: RoutingPair): DataLink {
  return new DataLink({
    systemId: link.systemId,
    sourceNodeSystemId: link.systemId * 10 + 1,
    destinationNodeSystemId: link.systemId * 10 + 2,
    sourcePortSystemId: link.systemId * 10 + 3,
    destinationPortSystemId: link.systemId * 10 + 4,
    linkType: link.linkType as never,
    sourceSubgraphSystemId: link.sourceSubgraphSystemId,
    destSubgraphSystemId: link.destSubgraphSystemId,
    fileSystemId: 1,
  });
}

function toUsecase(topology: CommittedUsecaseTopology): UseCase {
  return new UseCase({
    systemId: topology.systemId,
    fileSystemId: 1,
    keyVector: {
      valueSystemIds: topology.gkv.map(([, valueSystemId]) => valueSystemId),
    },
    subgraphSystemIds: [...topology.members],
    subgraphPairs: topology.pairs.map(
      ([sourceSubgraphSystemId, destSubgraphSystemId]) => ({
        sourceSubgraphSystemId,
        destSubgraphSystemId,
      }),
    ),
    type: topology.type as never,
  });
}

function topologyOf(usecase: UseCase): UsecaseTopology {
  return {
    usecaseSystemId: usecase.systemId,
    members: [...usecase.subgraphSystemIds],
    pairs: usecase.subgraphPairs.map(pair => [
      pair.sourceSubgraphSystemId,
      pair.destSubgraphSystemId,
    ]),
    type: usecase.type ?? 'UNSPECIFIED',
  };
}

export function singleHopScenario(input: {
  readonly committedUsecaseSystemId: number;
}): PureMdfScenarioBody {
  const oldPair = pair(100, 10, 20);
  return {
    committedUsecases: [
      committedUsecase({
        systemId: input.committedUsecaseSystemId,
        members: [10, 20],
        pairs: [[10, 20]],
        gkv: [[1, 100]],
        type: 'LINKED',
      }),
    ],
    subgraphs: [subgraph(10), subgraph(30, {isMdf: true}), subgraph(20)],
    committedPairs: [oldPair],
    deletedPairs: [oldPair],
    addedPairs: [pair(101, 10, 30), pair(102, 30, 20)],
  };
}

export function multiHopScenario(input: {
  readonly committedUsecaseSystemId: number;
}): PureMdfScenarioBody {
  const oldPair = pair(100, 10, 20);
  return {
    committedUsecases: [
      committedUsecase({
        systemId: input.committedUsecaseSystemId,
        members: [10, 20],
        pairs: [[10, 20]],
        gkv: [[1, 100]],
        type: 'LINKED',
      }),
    ],
    subgraphs: [
      subgraph(10),
      subgraph(30, {isMdf: true}),
      subgraph(40, {isMdf: true}),
      subgraph(20),
    ],
    committedPairs: [oldPair],
    deletedPairs: [oldPair],
    addedPairs: [pair(101, 10, 30), pair(102, 30, 40), pair(103, 40, 20)],
  };
}

export function mixedImpactScenario(input: {
  readonly usecaseSystemId: number;
  readonly pureMdfReplacement: {
    readonly oldPair: readonly [number, number];
    readonly chain: readonly number[];
  };
  readonly ordinaryDeletion: readonly [number, number];
}): PureMdfScenarioBody {
  const [oldSource, oldDestination] = input.pureMdfReplacement.oldPair;
  const replacementPairIds = input.pureMdfReplacement.chain
    .slice(0, -1)
    .map((_source, index) => 100 + index + 1);
  const replacementPairs = input.pureMdfReplacement.chain
    .slice(0, -1)
    .map((sourceSubgraphSystemId, index) =>
      pair(
        replacementPairIds[index]!,
        sourceSubgraphSystemId,
        input.pureMdfReplacement.chain[index + 1]!,
      ),
    );
  const ordinaryPairId = 200;
  const oldMdfPair = pair(100, oldSource, oldDestination);
  const oldOrdinaryPair = pair(
    ordinaryPairId,
    input.ordinaryDeletion[0]!,
    input.ordinaryDeletion[1]!,
  );
  const memberIds = new Set<number>([
    oldSource,
    oldDestination,
    input.ordinaryDeletion[0]!,
    input.ordinaryDeletion[1]!,
    ...input.pureMdfReplacement.chain,
  ]);
  return {
    committedUsecases: [
      committedUsecase({
        systemId: input.usecaseSystemId,
        members: [...memberIds],
        pairs: [
          [oldSource, oldDestination],
          [input.ordinaryDeletion[0]!, input.ordinaryDeletion[1]!],
        ],
        gkv: [[1, 100]],
        type: 'LINKED',
      }),
    ],
    subgraphs: [...memberIds].map(systemId =>
      subgraph(systemId, {
        isMdf: input.pureMdfReplacement.chain.slice(1, -1).includes(systemId),
      }),
    ),
    committedPairs: [oldMdfPair, oldOrdinaryPair],
    deletedPairs: [oldMdfPair, oldOrdinaryPair],
    addedPairs: replacementPairs,
  };
}

export interface NormalizedMdfDelta {
  readonly usecaseSystemId: number;
  readonly descriptorKind: 'UPDATE';
  readonly removedPairs: readonly [number, number][];
  readonly addedMembers: readonly number[];
  readonly addedPairs: readonly [number, number][];
  readonly emptyMdfAssignments: readonly number[];
  readonly gkv: readonly [number, number][];
  readonly usecaseType: string;
}

interface RecordedWrite {
  readonly usecaseSystemId: number;
  readonly operation: 'CREATE' | 'UPDATE' | 'DELETE';
  readonly usecase: UseCase | null;
  readonly delta?: {
    readonly addedSgSystemIds?: readonly number[];
    readonly removedSgSystemIds?: readonly number[];
    readonly addedPairs?: readonly {
      sourceSubgraphSystemId: number;
      destSubgraphSystemId: number;
    }[];
    readonly removedPairs?: readonly {
      sourceSubgraphSystemId: number;
      destSubgraphSystemId: number;
    }[];
    readonly newType?: string;
  };
  readonly assignments?: readonly {
    subgraphSystemId: number;
    valueDefinitionSystemIds: readonly number[];
  }[];
}

export interface MdfSubstitutionRoutingHarness {
  readonly input: RoutingInput;
  readonly writes: {
    readonly deltas: NormalizedMdfDelta[];
    readonly descriptors: ReadonlyArray<{
      usecaseSystemId: number;
      kind: 'CREATE' | 'UPDATE' | 'DELETE' | 'UNCHANGED';
    }>;
    readonly repositoryReadCounts: {
      readonly graph: number;
      readonly usecase: number;
      readonly legacyEcSgkv: number;
    };
  };
  readonly observed: {
    readonly phaseOrder: string[];
    readonly topologyDecisionKinds: string[];
    readonly classificationTopologies: UsecaseTopology[];
    readonly collisionIds: string[];
    readonly inputBeforeRun: string;
    readonly inputAfterRun: string;
  };
  run(): Promise<ReturnType<typeof Result.ok>>;
  resolveCollision(collisionId: string): Promise<Result<SameGkvCollision>>;
  clearRecordedWrites(): void;
}

function inputSnapshot(input: RoutingInput): string {
  return JSON.stringify({
    mode: input.mode,
    fileSystemId: input.fileSystemId,
    selectedUsecaseSystemIds: [
      ...input.selection.selectedUsecaseSystemIds,
    ].sort((left, right) => left - right),
    subgraphs: input.graphSnapshot.subgraphs
      .map(item => ({
        systemId: item.subgraph.systemId,
        requestedSgkvs: item.requestedSgkvs,
        isMdf: item.isMdf,
      }))
      .sort((left, right) => left.systemId - right.systemId),
    committedUsecases: input.graphSnapshot.committedUsecases
      .map(topologyOf)
      .sort((left, right) => left.usecaseSystemId - right.usecaseSystemId),
    activeManualUsecaseEdits: input.activeManualUsecaseEdits.map(edit => ({
      changeId: edit.changeId,
      operation: edit.operation,
      usecaseSystemId: edit.usecase?.systemId ?? null,
      referencedComponents: edit.referencedComponents,
    })),
  });
}

function adjacentPairs(
  combination: RoutingCombination,
): readonly {sourceSubgraphSystemId: number; destSubgraphSystemId: number}[] {
  return combination.path.subgraphSystemIds
    .slice(0, -1)
    .map((sourceSubgraphSystemId, index) => ({
      sourceSubgraphSystemId,
      destSubgraphSystemId: combination.path.subgraphSystemIds[index + 1]!,
    }));
}

export function createMdfSubstitutionRoutingHarness(
  scenario: MdfSubstitutionScenario,
): MdfSubstitutionRoutingHarness {
  const committedUsecases = scenario.committedUsecases.map(toUsecase);
  const selectedUsecases = committedUsecases.filter(usecase =>
    scenario.selectedUsecaseSystemIds.includes(usecase.systemId),
  );
  const allLinks = [...scenario.committedPairs, ...scenario.addedPairs].map(
    toDataLink,
  );
  const deletedLinks = scenario.deletedPairs.map(toDataLink);
  const allSubgraphIds = new Set<number>(
    scenario.subgraphs.map(item => item.subgraph.systemId),
  );
  for (const usecase of committedUsecases) {
    for (const systemId of usecase.subgraphSystemIds)
      allSubgraphIds.add(systemId);
  }
  for (const link of allLinks) {
    allSubgraphIds.add(link.sourceSubgraphSystemId);
    allSubgraphIds.add(link.destSubgraphSystemId);
  }
  const requestedSgkvsBySubgraph = scenario.requestedSgkvsBySubgraph ?? {};
  const routingSubgraphs = [...allSubgraphIds]
    .sort((left, right) => left - right)
    .map(systemId => {
      const current = scenario.subgraphs.find(
        item => item.subgraph.systemId === systemId,
      );
      return (
        current ?? {
          ...subgraph(systemId),
          requestedSgkvs: requestedSgkvsBySubgraph[systemId] ?? [],
        }
      );
    })
    .map(item => ({
      ...item,
      requestedSgkvs:
        requestedSgkvsBySubgraph[item.subgraph.systemId] ?? item.requestedSgkvs,
    }));
  const inputInit = {
    fileSystemId: 1,
    selection: {
      selectedUsecaseSystemIds: [...scenario.selectedUsecaseSystemIds],
      activeSubgraphs: routingSubgraphs.map(item => ({
        systemId: item.subgraph.systemId,
        sgkvs: item.requestedSgkvs,
      })),
      excludedSubgraphSystemIds: [],
      excludedDataLinkSystemIds: [],
      excludedControlLinkSystemIds: [],
    },
    selectedUsecases,
    graphSnapshot: {
      subgraphs: routingSubgraphs,
      routableDataLinks: allLinks,
      routableControlLinks: [],
      overlayDataLinks: allLinks,
      overlayControlLinks: [],
      committedUsecases,
      sessionEdits: {
        ...emptyGraphEdits(),
        deletedSgs: (scenario.deletedSubgraphSystemIds ?? []).map(
          systemId => subgraph(systemId).subgraph,
        ),
        deletedDataLinks: deletedLinks,
      },
    },
    activeManualUsecaseEdits: [...(scenario.activeManualUsecaseEdits ?? [])],
  };
  const input =
    scenario.mode === 'MANUAL'
      ? createManualRoutingInput({
          ...inputInit,
          manualTopology: {pairs: []},
        })
      : createAutoRoutingInput(inputInit);

  const phaseOrder: string[] = [];
  const topologyDecisionKinds: string[] = [];
  const classificationTopologies: UsecaseTopology[] = [];
  const collisionIds: string[] = [];
  const records: RecordedWrite[] = [];
  const repositoryReadCounts = {graph: 0, usecase: 0, legacyEcSgkv: 0};
  let nextChangeId = 1;

  const allRoutingSubgraphIds = routingSubgraphs.map(
    item => item.subgraph.systemId,
  );
  const subgraphRepository = {
    getSgkvs: async (_fileSystemId: number, ids: readonly number[]) => {
      if (ids.length !== allRoutingSubgraphIds.length)
        repositoryReadCounts.legacyEcSgkv += 1;
      return ids.map(sgSystemId => ({
        sgSystemId,
        sgkvSystemId: 0,
        keyValues: [] as KvPair[],
      }));
    },
    resolveKeyValues: async (
      _fileSystemId: number,
      valueSystemIds: readonly number[],
    ) =>
      valueSystemIds.map(valueDefSystemId => ({
        keyDefSystemId: 1,
        valueDefSystemId,
      })),
  };
  const subsystemRepository = {
    findOrphanSubsystemSystemIds: async () => [],
  };
  const usecaseRepository = {
    create: async (usecase: UseCase) => {
      records.push({
        usecaseSystemId: usecase.systemId,
        operation: 'CREATE',
        usecase,
      });
      return {systemId: usecase.systemId, changeId: nextChangeId++};
    },
    delete: async (usecaseSystemId: number) => {
      records.push({usecaseSystemId, operation: 'DELETE', usecase: null});
      return {systemId: usecaseSystemId, changeId: nextChangeId++};
    },
    applyStructuralChange: async (
      usecaseSystemId: number,
      delta: RecordedWrite['delta'],
      _options: unknown,
      _referencedComponents: unknown,
      assignments: RecordedWrite['assignments'],
    ) => {
      records.push({
        usecaseSystemId,
        operation: 'UPDATE',
        usecase:
          committedUsecases.find(item => item.systemId === usecaseSystemId) ??
          null,
        delta,
        assignments,
      });
      return {systemId: usecaseSystemId, changeId: nextChangeId++};
    },
  };
  const unitOfWork = {
    getSubgraphRepository: () => subgraphRepository,
    getSubsystemRepository: () => subsystemRepository,
    getUsecaseRepository: () => usecaseRepository,
    getWriteContext: () => ({groupId: 'pure-mdf-group'}),
  };
  const idGeneration = {
    getNextId: async () => 900,
  };

  const trace = (
    name: string,
    phase: {run: (...args: never[]) => Promise<unknown>},
    after?: (context: RoutingContext) => void,
  ) => ({
    run: async (...args: never[]) => {
      phaseOrder.push(name);
      const result = await phase.run(...args);
      after?.(args[0] as RoutingContext);
      return result;
    },
  });
  const topologyChangeAnalysis = new TopologyChangeAnalysisService();
  const classification = new ClassificationService();
  const classificationPhase = scenario.failClassification
    ? {
        run: async () =>
          Result.fail(RoutingIssueFactory.stagingPairEndpointMissing(0, 0)),
      }
    : classification;
  const combinationExpansion = new CombinationExpansionService();
  const tracedCombinationExpansion = {
    run: async (context: RoutingContext) => {
      const result = await combinationExpansion.run(context);
      if (result.kind === 'OK') {
        context.routingCandidates.combinations.push(
          ...(scenario.dfsCandidates ?? []),
        );
      }
      return result;
    },
  };
  const engine = new RoutingEngine(
    trace('PRE_VALIDATION', new PreValidationService()),
    trace('TOPOLOGY_CHANGE_ANALYSIS', topologyChangeAnalysis, context => {
      topologyDecisionKinds.push(
        ...(context.topologyChangeAnalysis?.decisions.map(
          decision => decision.kind,
        ) ?? []),
      );
      for (const decision of context.topologyChangeAnalysis?.decisions ?? []) {
        if (decision.kind === 'MDF_SUBSTITUTION')
          classificationTopologies.push(topologyOf(projectedUsecase(decision)));
      }
    }),
    trace('ISLAND_TRANSITION', new IslandTransitionService()),
    trace('KV_RESOLUTION', new KvResolutionService()),
    trace('SEED_DETECTION', new SeedDetectionService()),
    trace('CONE_COMPUTATION', new ConeComputationService()),
    trace('DFS_ROUTING', new DfsRoutingService()),
    trace('COMBINATION_EXPANSION', tracedCombinationExpansion),
    trace('CLASSIFICATION', classificationPhase, context => {
      collisionIds.push(
        ...context.sameGkvCollisions.map(collision => collision.collisionId),
      );
      for (const classified of context.classifiedUcs)
        classificationTopologies.push(
          topologyOf(candidateUsecase(classified.candidate)),
        );
    }),
    trace('ORPHAN_VALIDATION', new OrphanValidationService()),
    trace('ROUTING_CHANGE_STAGER', new RoutingChangeStager()),
    trace('RESPONSE_BUILDER', new ResponseBuilder()),
  ) as RoutingEngine;

  function projectedUsecase(
    decision: Extract<UsecaseTopologyDecision, {kind: 'MDF_SUBSTITUTION'}>,
  ): UseCase {
    return new UseCase({
      systemId: decision.usecase.systemId,
      fileSystemId: decision.usecase.fileSystemId,
      keyVector: {
        valueSystemIds: [...decision.usecase.keyVector.valueSystemIds],
      },
      subgraphSystemIds: [
        ...decision.structuralChange.resultingSubgraphSystemIds,
      ],
      subgraphPairs: decision.structuralChange.resultingPairs.map(pair => ({
        ...pair,
      })),
      type: decision.structuralChange.resultingType,
    });
  }

  function candidateUsecase(candidate: RoutingCombination): UseCase {
    return new UseCase({
      systemId: 0,
      fileSystemId: 1,
      keyVector: {
        valueSystemIds: candidate.gkv.map(pair => pair.valueDefSystemId),
      },
      subgraphSystemIds: [...candidate.path.subgraphSystemIds],
      subgraphPairs: adjacentPairs(candidate),
      type: 'LINKED' as never,
    });
  }

  const inputBeforeRun = inputSnapshot(input);
  const writes = {
    deltas: [] as NormalizedMdfDelta[],
    descriptors: [] as Array<{
      usecaseSystemId: number;
      kind: 'CREATE' | 'UPDATE' | 'DELETE' | 'UNCHANGED';
    }>,
    repositoryReadCounts,
  };
  function refreshWrites(): void {
    writes.deltas.splice(0, writes.deltas.length);
    writes.descriptors.splice(0, writes.descriptors.length);
    for (const record of records) {
      const kind = record.operation;
      writes.descriptors.push({usecaseSystemId: record.usecaseSystemId, kind});
      if (record.operation !== 'UPDATE' || record.delta === undefined) continue;
      const usecase = record.usecase;
      if (usecase === null) continue;
      writes.deltas.push({
        usecaseSystemId: record.usecaseSystemId,
        descriptorKind: 'UPDATE',
        removedPairs: (record.delta.removedPairs ?? []).map(pair => [
          pair.sourceSubgraphSystemId,
          pair.destSubgraphSystemId,
        ]),
        addedMembers: [...(record.delta.addedSgSystemIds ?? [])].sort(
          (left, right) => left - right,
        ),
        addedPairs: (record.delta.addedPairs ?? []).map(pair => [
          pair.sourceSubgraphSystemId,
          pair.destSubgraphSystemId,
        ]),
        emptyMdfAssignments: (record.assignments ?? [])
          .filter(
            assignment => assignment.valueDefinitionSystemIds.length === 0,
          )
          .map(assignment => assignment.subgraphSystemId)
          .sort((left, right) => left - right),
        gkv: usecase.keyVector.valueSystemIds.map(valueSystemId => [
          1,
          valueSystemId,
        ]),
        usecaseType: record.delta.newType ?? usecase.type ?? 'UNSPECIFIED',
      });
    }
  }
  function clearRecordedWrites(): void {
    records.splice(0, records.length);
    refreshWrites();
  }
  async function run() {
    const result = await engine.run(
      input,
      unitOfWork as never,
      idGeneration as never,
    );
    refreshWrites();
    const contextAfterRun = inputSnapshot(input);
    observed.inputAfterRun = contextAfterRun;
    return result;
  }
  async function resolveCollision(collisionId: string) {
    const result = await engine.resolveCollision(
      input,
      unitOfWork as never,
      collisionId,
    );
    refreshWrites();
    observed.inputAfterRun = inputSnapshot(input);
    return result;
  }
  const observed = {
    phaseOrder,
    topologyDecisionKinds,
    classificationTopologies,
    collisionIds,
    inputBeforeRun,
    inputAfterRun: inputBeforeRun,
  };
  return {
    input,
    writes,
    observed,
    run,
    resolveCollision,
    clearRecordedWrites,
  };
}
