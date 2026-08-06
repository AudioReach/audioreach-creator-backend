/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {DATA_LINK_TYPE} from '../../../../domain/entities/usecase-data/links/data-link-type.js';
import {Result} from '../../../../application/shared/result/result.js';
import type {Result as ResultType} from '../../../../application/shared/result/result.js';
import type {RoutingContext} from '../contracts/routing-context.js';
import {ROUTING_MODE} from '../contracts/routing-input.js';
import {
  SEED_REASON,
  type SgkvInstance,
  type SeedReason,
} from '../contracts/routing-state.js';

function canonicalInstance(instance: SgkvInstance): string {
  return [...instance.keyValues]
    .sort(
      (left, right) =>
        left.keyDefSystemId - right.keyDefSystemId ||
        left.valueDefSystemId - right.valueDefSystemId,
    )
    .map(keyValue => `${keyValue.keyDefSystemId}:${keyValue.valueDefSystemId}`)
    .join('|');
}

function canonicalInstanceSet(
  instances: readonly SgkvInstance[],
): ReadonlySet<string> {
  return new Set(instances.map(instance => canonicalInstance(instance)));
}

interface SeedAccumulator {
  readonly seeds: Set<number>;
  readonly reasons: Map<number, SeedReason>;
}

function addSeed(
  accumulator: SeedAccumulator,
  sgSystemId: number,
  reason: SeedReason,
): void {
  accumulator.seeds.add(sgSystemId);
  if (!accumulator.reasons.has(sgSystemId))
    accumulator.reasons.set(sgSystemId, reason);
}

function addNoUsecaseSeeds(
  accumulator: SeedAccumulator,
  effectiveScope: ReadonlySet<number>,
): void {
  for (const sgSystemId of effectiveScope)
    addSeed(accumulator, sgSystemId, SEED_REASON.NoUsecaseContext);
}

function addKvChangeSeeds(
  accumulator: SeedAccumulator,
  context: RoutingContext,
): void {
  if (context.kvResolutions === null) return;
  for (const [sgSystemId, apiInstances] of context.kvResolutions.perSg) {
    const baselineInstances =
      context.kvResolutions.ucFilteredBaseline.get(sgSystemId) ?? [];
    const apiSet = canonicalInstanceSet(apiInstances);
    const baselineSet = canonicalInstanceSet(baselineInstances);
    if (
      apiSet.size !== baselineSet.size ||
      [...apiSet].some(instance => !baselineSet.has(instance))
    ) {
      addSeed(accumulator, sgSystemId, SEED_REASON.KvChanged);
    }
  }
}

function addNewSubgraphSeeds(
  accumulator: SeedAccumulator,
  context: RoutingContext,
): void {
  if (context.kvResolutions === null) return;
  const committedSubgraphSystemIds = new Set(
    context.input.graphSnapshot.committedUsecases.flatMap(
      usecase => usecase.subgraphSystemIds,
    ),
  );
  for (const sgSystemId of context.kvResolutions.perSg.keys()) {
    if (!committedSubgraphSystemIds.has(sgSystemId))
      addSeed(accumulator, sgSystemId, SEED_REASON.NewSubgraph);
  }
}

function addLinkSeeds(
  accumulator: SeedAccumulator,
  context: RoutingContext,
  effectiveScope: ReadonlySet<number>,
): void {
  const {addedDataLinks, deletedDataLinks} =
    context.input.graphSnapshot.sessionEdits;
  for (const link of addedDataLinks) {
    if (
      link.linkType === DATA_LINK_TYPE.Normal &&
      effectiveScope.has(link.sourceSubgraphSystemId) &&
      effectiveScope.has(link.destSubgraphSystemId)
    ) {
      addSeed(accumulator, link.sourceSubgraphSystemId, SEED_REASON.LinkAdded);
      addSeed(accumulator, link.destSubgraphSystemId, SEED_REASON.LinkAdded);
    }
  }
  for (const link of deletedDataLinks) {
    if (link.linkType !== DATA_LINK_TYPE.Normal) continue;
    if (effectiveScope.has(link.sourceSubgraphSystemId))
      addSeed(
        accumulator,
        link.sourceSubgraphSystemId,
        SEED_REASON.LinkDeleted,
      );
    if (effectiveScope.has(link.destSubgraphSystemId))
      addSeed(accumulator, link.destSubgraphSystemId, SEED_REASON.LinkDeleted);
  }
}

function addOutOfSelectionSeeds(
  accumulator: SeedAccumulator,
  context: RoutingContext,
  effectiveScope: ReadonlySet<number>,
): void {
  const selectedScope = new Set(
    context.input.selectedUsecases.flatMap(
      usecase => usecase.subgraphSystemIds,
    ),
  );
  for (const sgSystemId of effectiveScope) {
    if (!selectedScope.has(sgSystemId))
      addSeed(accumulator, sgSystemId, SEED_REASON.OutOfSelection);
  }
}

export class SeedDetectionService {
  // eslint-disable-next-line @typescript-eslint/require-await -- Phase execution remains promise-based for ordered orchestration.
  async run(context: RoutingContext): Promise<ResultType<void>> {
    if (context.input.mode === ROUTING_MODE.Manual) return Result.ok();
    if (context.kvResolutions === null)
      throw new Error(
        'SeedDetectionService requires Phase 4 kvResolutions in automatic mode',
      );

    const accumulator: SeedAccumulator = {
      seeds: new Set(),
      reasons: new Map(),
    };
    const effectiveScope = new Set(
      context.input.graphSnapshot.subgraphs.map(
        entry => entry.subgraph.systemId,
      ),
    );
    if (context.input.selectedUsecases.length === 0) {
      addNoUsecaseSeeds(accumulator, effectiveScope);
      context.seeds = {
        sgSystemIds: accumulator.seeds,
        reasons: accumulator.reasons,
      };
      return Result.ok();
    }

    addKvChangeSeeds(accumulator, context);
    addNewSubgraphSeeds(accumulator, context);
    addLinkSeeds(accumulator, context, effectiveScope);
    addOutOfSelectionSeeds(accumulator, context, effectiveScope);

    context.seeds = {
      sgSystemIds: accumulator.seeds,
      reasons: accumulator.reasons,
    };
    return Result.ok();
  }
}
