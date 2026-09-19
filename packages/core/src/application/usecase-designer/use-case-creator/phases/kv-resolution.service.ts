/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Result} from '../../../../application/shared/result/result.js';
import type {Result as ResultType} from '../../../../application/shared/result/result.js';
import type {Issue} from '../../../../shared/issues/issue.js';
import type {KvPair} from '../../../ports/persistence/repositories/shared/kv-pair.js';
import type {
  SgkvEntry,
  SubgraphRepository,
} from '../../../ports/persistence/repositories/subgraph/subgraph.repository.js';
import type {RoutingContext} from '../contracts/routing-context.js';
import type {SgkvInstance, KvResolutions} from '../contracts/routing-state.js';
import {RoutingIssueFactory} from '../issues/routing-issue-factory.js';

function sortedUniqueIds(ids: Iterable<number>): number[] {
  return [...new Set(ids)].sort((left, right) => left - right);
}

function canonicalKeyValues(keyValues: readonly KvPair[]): KvPair[] {
  return [...keyValues].sort(
    (left, right) =>
      left.keyDefSystemId - right.keyDefSystemId ||
      left.valueDefSystemId - right.valueDefSystemId,
  );
}

export class KvResolutionService {
  async run(
    context: RoutingContext,
    subgraphRepository: SubgraphRepository,
  ): Promise<ResultType<void>> {
    const {fileSystemId, selectedUsecases, graphSnapshot} = context.input;
    const subgraphSystemIds = graphSnapshot.subgraphs.map(
      entry => entry.subgraph.systemId,
    );
    const baselineEntries = await subgraphRepository.getSgkvs(
      fileSystemId,
      subgraphSystemIds,
    );
    const selectedValueSystemIds = new Set(
      selectedUsecases.flatMap(usecase => usecase.keyVector.valueSystemIds),
    );
    const baselineBySubgraph = new Map<number, SgkvEntry[]>();
    for (const entry of baselineEntries) {
      const entries = baselineBySubgraph.get(entry.sgSystemId) ?? [];
      entries.push(entry);
      baselineBySubgraph.set(entry.sgSystemId, entries);
    }

    const ucFilteredBaseline = new Map<number, readonly SgkvInstance[]>();
    for (const sgSystemId of subgraphSystemIds) {
      const filteredInstances = (baselineBySubgraph.get(sgSystemId) ?? [])
        .map(entry => ({
          keyValues: canonicalKeyValues(
            entry.keyValues.filter(keyValue =>
              selectedValueSystemIds.has(keyValue.valueDefSystemId),
            ),
          ),
        }))
        .filter(instance => instance.keyValues.length > 0);
      ucFilteredBaseline.set(sgSystemId, filteredInstances);
    }

    const requestedValueSystemIds = sortedUniqueIds(
      graphSnapshot.subgraphs.flatMap(entry => entry.requestedSgkvs).flat(),
    );
    const resolvedKeyValues = await subgraphRepository.resolveKeyValues(
      fileSystemId,
      requestedValueSystemIds,
    );
    const keyValueByValueSystemId = new Map(
      resolvedKeyValues.map(keyValue => [keyValue.valueDefSystemId, keyValue]),
    );

    const perSg = new Map<number, readonly SgkvInstance[]>();
    const issues: Issue[] = [];
    for (const routingSubgraph of graphSnapshot.subgraphs) {
      const subgraphSystemId = routingSubgraph.subgraph.systemId;
      const requestedSgkvs = routingSubgraph.requestedSgkvs;
      if (requestedSgkvs.length === 0) {
        perSg.set(subgraphSystemId, [{keyValues: []}]);
        continue;
      }

      const instances: SgkvInstance[] = [];
      for (const requestedValueIds of requestedSgkvs) {
        const missingValueIds = requestedValueIds.filter(
          valueSystemId => !keyValueByValueSystemId.has(valueSystemId),
        );
        if (missingValueIds.length > 0) {
          issues.push(
            RoutingIssueFactory.sgkvValuesNotFound(
              subgraphSystemId,
              missingValueIds,
            ),
          );
          continue;
        }

        const keyValues = requestedValueIds.map(
          valueSystemId => keyValueByValueSystemId.get(valueSystemId)!,
        );
        const keySystemIds = new Set(
          keyValues.map(keyValue => keyValue.keyDefSystemId),
        );
        if (keySystemIds.size !== keyValues.length) {
          issues.push(
            RoutingIssueFactory.sgkvMalformed(
              subgraphSystemId,
              requestedValueIds,
            ),
          );
          continue;
        }
        instances.push({keyValues: canonicalKeyValues(keyValues)});
      }
      perSg.set(subgraphSystemId, instances);
    }

    if (issues.length > 0) return Result.fail(...issues);

    const resolutions: KvResolutions = {
      perSg,
      ucFilteredBaseline,
    };
    context.kvResolutions = resolutions;
    return Result.ok();
  }
}
