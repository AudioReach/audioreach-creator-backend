/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ActiveManualUsecaseEdit} from '../../../../../../../src/application/ports/persistence/repositories/usecase/usecase.repository.js';
import {
  createMdfSubstitutionRoutingHarness,
  pair,
  committedUsecase,
  subgraph,
  type MdfSubstitutionRoutingHarness,
  type RoutingPair,
} from './mdf-substitution-routing-harness.js';

export interface CollapseScenario {
  readonly committedUsecaseSystemId: number;
  readonly mdfSgSystemIds: readonly number[];
  readonly sourceSgSystemId: number;
  readonly destSgSystemId: number;
  readonly committedChainLinks: readonly {
    readonly systemId: number;
    readonly src: number;
    readonly dst: number;
  }[];
  readonly effectiveDirectLinkSystemId: number;
  readonly extraDeletedNonMdfSgSystemId?: number;
}

export interface NormalizedCollapseDelta {
  readonly usecaseSystemId: number;
  readonly descriptorKind: 'UPDATE';
  readonly removedMembers: readonly number[];
  readonly removedPairs: readonly [number, number][];
  readonly addedPairs: readonly [number, number][];
  readonly gkv: readonly [number, number][];
  readonly usecaseType: string;
}

export interface CollapseRoutingHarness {
  readonly writes: {
    readonly deltas: readonly NormalizedCollapseDelta[];
    readonly descriptors: ReadonlyArray<{
      usecaseSystemId: number;
      kind: 'CREATE' | 'UPDATE' | 'DELETE' | 'UNCHANGED';
    }>;
  };
  readonly observed: {readonly topologyDecisionKinds: readonly string[]};
  run(): ReturnType<MdfSubstitutionRoutingHarness['run']>;
  failNextWrite(): void;
  clearRecordedWrites(): void;
}

function asRoutingPair(
  link: CollapseScenario['committedChainLinks'][number],
): RoutingPair {
  return pair(link.systemId, link.src, link.dst);
}

/**
 * Builds an engine-level collapse fixture while sharing the full phase wiring and
 * write recorder used by the forward MDF-normalization chain tests.
 */
export function createMdfCollapseRoutingHarness(options: {
  readonly scenario: CollapseScenario;
  readonly mode: 'AUTOMATIC' | 'MANUAL';
  readonly selectedUsecaseSystemIds: readonly number[];
  readonly activeManualUsecaseEdits?: readonly ActiveManualUsecaseEdit[];
}): CollapseRoutingHarness {
  const {scenario} = options;
  const committedPairs = scenario.committedChainLinks.map(asRoutingPair);
  const committedMembers = [
    scenario.sourceSgSystemId,
    ...scenario.mdfSgSystemIds,
    scenario.destSgSystemId,
  ];
  if (scenario.extraDeletedNonMdfSgSystemId !== undefined)
    committedMembers.push(scenario.extraDeletedNonMdfSgSystemId);

  const harness = createMdfSubstitutionRoutingHarness({
    mode: options.mode,
    selectedUsecaseSystemIds: options.selectedUsecaseSystemIds,
    activeManualUsecaseEdits: options.activeManualUsecaseEdits,
    committedUsecases: [
      committedUsecase({
        systemId: scenario.committedUsecaseSystemId,
        members: committedMembers,
        pairs: scenario.committedChainLinks.map(link => [link.src, link.dst]),
        gkv: [[1, 100]],
        type: 'LINKED',
      }),
    ],
    subgraphs: [
      subgraph(scenario.sourceSgSystemId),
      subgraph(scenario.destSgSystemId),
    ],
    activeSubgraphSystemIds: [
      scenario.sourceSgSystemId,
      scenario.destSgSystemId,
    ],
    committedPairs,
    committedDataLinks: committedPairs,
    addedPairs: [
      pair(
        scenario.effectiveDirectLinkSystemId,
        scenario.sourceSgSystemId,
        scenario.destSgSystemId,
      ),
    ],
    deletedPairs: [],
    deletedMdfSubgraphSystemIds: scenario.mdfSgSystemIds,
    deletedSubgraphSystemIds: [
      ...scenario.mdfSgSystemIds,
      ...(scenario.extraDeletedNonMdfSgSystemId === undefined
        ? []
        : [scenario.extraDeletedNonMdfSgSystemId]),
    ],
  });

  return {
    writes: {
      get deltas(): readonly NormalizedCollapseDelta[] {
        return harness.writes.deltas;
      },
      get descriptors() {
        return harness.writes.descriptors;
      },
    },
    observed: {
      get topologyDecisionKinds() {
        return harness.observed.topologyDecisionKinds;
      },
    },
    run: () => harness.run(),
    failNextWrite: () => harness.failNextStructuralWrite(),
    clearRecordedWrites: () => harness.clearRecordedWrites(),
  };
}

export function singleHopCollapseScenario(options: {
  readonly committedUsecaseSystemId: number;
}): CollapseScenario {
  return {
    committedUsecaseSystemId: options.committedUsecaseSystemId,
    mdfSgSystemIds: [30],
    sourceSgSystemId: 10,
    destSgSystemId: 20,
    committedChainLinks: [
      {systemId: 401, src: 10, dst: 30},
      {systemId: 402, src: 30, dst: 20},
    ],
    effectiveDirectLinkSystemId: 501,
  };
}
