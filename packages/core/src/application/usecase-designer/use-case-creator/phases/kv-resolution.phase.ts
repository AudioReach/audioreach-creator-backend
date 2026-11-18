/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Result} from '../../../../application/shared/result/result.js';
import type {LegacyIssue} from '../../../../shared/issues/issue.js';
import type {KvPair} from '../../../ports/persistence/repositories/shared/kv-pair.js';
import type {SubgraphRepository} from '../../../ports/persistence/repositories/subgraph/subgraph.repository.js';
import type {KeyValueDefinitionRepository} from '../../../ports/persistence/repositories/key-value/key-value-definition.repository.js';
import {CONFIGURATION_INCLUDES} from '../../../ports/persistence/query-services/configuration-includes.js';
import {requireAll} from '../../../shared/result/require-all.js';
import {type SgkvEntry, toSgkvEntries} from '../shared/sgkv-entries.js';
import type {RoutingContext} from '../contracts/routing-context.js';
import type {RoutingSubgraph} from '../contracts/routing-input.js';
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

function shouldUseEmptySgkvInstance(
  routingSubgraph: RoutingSubgraph,
  effectiveMdfSubgraphSystemIds: ReadonlySet<number>,
): boolean {
  return (
    effectiveMdfSubgraphSystemIds.has(routingSubgraph.subgraph.systemId) ||
    routingSubgraph.requestedSgkvs.length === 0
  );
}

export class KvResolutionPhase {
  async run(
    context: RoutingContext,
    subgraphRepository: SubgraphRepository,
    keyValueDefinitionRepository: KeyValueDefinitionRepository,
  ): Promise<Result<void>> {
    const {fileSystemId, selectedUsecases, graphSnapshot} = context.input;
    const subgraphSystemIds = graphSnapshot.subgraphs.map(
      entry => entry.subgraph.systemId,
    );
    const baselineEntries = toSgkvEntries(
      requireAll(
        await subgraphRepository.findSubgraphs(
          fileSystemId,
          subgraphSystemIds,
          CONFIGURATION_INCLUDES.FullDetails,
        ),
      ),
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
    // A requested value that is not found is reported per subgraph below.
    const requestedPairs = await keyValueDefinitionRepository.findKeyValuePairs(
      fileSystemId,
      requestedValueSystemIds,
    );
    const keyValueByValueSystemId = new Map<number, KvPair>(
      requestedPairs.items.map(pair => [
        pair.value.systemId,
        {
          keyDefSystemId: pair.key.systemId,
          valueDefSystemId: pair.value.systemId,
        },
      ]),
    );

    const perSg = new Map<number, readonly SgkvInstance[]>();
    const issues: LegacyIssue[] = [];
    for (const routingSubgraph of graphSnapshot.subgraphs) {
      const subgraphSystemId = routingSubgraph.subgraph.systemId;
      const requestedSgkvs = routingSubgraph.requestedSgkvs;
      if (
        shouldUseEmptySgkvInstance(routingSubgraph, graphSnapshot.mdf.effective)
      ) {
        // spec §11: every MDF slot contributes exactly one empty routing instance
        // regardless of how many empty alternatives requestedSgkvs contains.
        // Phase 1 (ARC-ROUTING-MDF-01) blocks non-empty MDF selections before
        // Phase 4 runs; this branch is the canonicalization safety net.
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
