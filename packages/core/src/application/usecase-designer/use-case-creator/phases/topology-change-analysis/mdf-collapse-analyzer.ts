/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {SubgraphPair} from '../../../../ports/persistence/repositories/shared/links-for-pair.js';
import {DATA_LINK_TYPE} from '../../../../../domain/entities/usecase-data/links/data-link-type.js';
import type {DataLink} from '../../../../../domain/entities/usecase-data/links/data-link.js';
import type {UseCase} from '../../../../../domain/entities/usecase-data/usecase/usecase.js';
import {
  MDF_TOPOLOGY_REWRITE_KIND,
  type MdfTopologyRewrite,
} from '../../contracts/routing-state.js';
import {
  directedPairKey,
  unorderedPairKey,
} from '../../shared/usecase-topology.js';
import type {TopologyImpactInventory} from './topology-impact-inventory.js';

/**
 * Finds one unambiguous A → MDF1 → ... → MDFn → B segment in a committed UC.
 * All intermediates must be deleted MDF members; the returned path includes its
 * surviving endpoints. Ambiguous branches and cycles are intentionally rejected.
 */
function findMdfChain(
  startId: number,
  pairsBySource: ReadonlyMap<number, readonly number[]>,
  deletedMdfSet: ReadonlySet<number>,
  ucMemberSet: ReadonlySet<number>,
): readonly number[] | null {
  const completePaths: number[][] = [];
  const currentPath = [startId];
  const visited = new Set<number>([startId]);

  const visit = (currentId: number): void => {
    if (completePaths.length > 1) return;
    for (const nextId of pairsBySource.get(currentId) ?? []) {
      if (completePaths.length > 1 || visited.has(nextId)) continue;
      if (deletedMdfSet.has(nextId)) {
        visited.add(nextId);
        currentPath.push(nextId);
        visit(nextId);
        currentPath.pop();
        visited.delete(nextId);
      } else if (ucMemberSet.has(nextId)) {
        completePaths.push([...currentPath, nextId]);
      }
    }
  };

  visit(startId);
  return completePaths.length === 1 ? completePaths[0] : null;
}

function pair(
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
): SubgraphPair {
  return {sourceSubgraphSystemId, destSubgraphSystemId};
}

function resultingType(
  members: readonly number[],
  pairs: readonly SubgraphPair[],
  isEc: boolean,
): UseCase['type'] {
  // A collapse may preserve identity only when it preserves the UC type.
  if (isEc) return 'EC';
  const pairedMembers = new Set(
    pairs.flatMap(({sourceSubgraphSystemId, destSubgraphSystemId}) => [
      sourceSubgraphSystemId,
      destSubgraphSystemId,
    ]),
  );
  if (members.some(memberId => !pairedMembers.has(memberId))) return 'ISLAND';
  return pairs.length > 0 ? 'LINKED' : 'ISLAND';
}

type SupportedMdfChainLinkType =
  | (typeof DATA_LINK_TYPE)['Ec']
  | (typeof DATA_LINK_TYPE)['Normal'];

/**
 * Resolves the shared supported link type for an MDF chain.
 *
 * Every logical chain segment must have committed-link evidence before this
 * function is called. Collapse is safe only when every physical link across
 * those segments is uniformly EC or uniformly NORMAL. Mixed semantics and
 * INTER_USECASE links cannot be represented by one replacement direct link.
 */
function resolveSupportedMdfChainLinkType(
  linksByChainSegment: readonly (readonly DataLink[])[],
): SupportedMdfChainLinkType | null {
  const allEc = linksByChainSegment.every(links =>
    links.every(link => link.linkType === DATA_LINK_TYPE.Ec),
  );
  if (allEc) return DATA_LINK_TYPE.Ec;
  const allNormal = linksByChainSegment.every(links =>
    links.every(link => link.linkType === DATA_LINK_TYPE.Normal),
  );
  return allNormal ? DATA_LINK_TYPE.Normal : null;
}

/**
 * Detects committed MDF-chain segments whose deleted members are replaced by a
 * session-added direct data link. Ineligible segments deliberately fall through
 * to ordinary deletion handling.
 */
export class MdfCollapseAnalyzer {
  // eslint-disable-next-line sonarjs/cognitive-complexity
  analyze(
    committedUsecase: UseCase,
    inventory: TopologyImpactInventory,
  ): MdfTopologyRewrite[] {
    // Only committed UC members that were MDFs and are deleted this session are
    // candidates for collapse. Other deleted members use ordinary handling.
    const deletedMdfInUsecase = committedUsecase.subgraphSystemIds.filter(id =>
      inventory.deletedMdfSubgraphSystemIds.has(id),
    );
    if (deletedMdfInUsecase.length === 0) return [];

    const deletedMdfSet = new Set(deletedMdfInUsecase);
    const usecaseMemberSet = new Set(committedUsecase.subgraphSystemIds);
    const survivingBoundaries = committedUsecase.subgraphSystemIds.filter(
      id => !deletedMdfSet.has(id),
    );
    // Index the committed UC topology so each surviving boundary can discover
    // a directed segment through deleted MDF members.
    const pairsBySource = new Map<number, number[]>();
    for (const currentPair of committedUsecase.subgraphPairs) {
      const destinations =
        pairsBySource.get(currentPair.sourceSubgraphSystemId) ?? [];
      destinations.push(currentPair.destSubgraphSystemId);
      pairsBySource.set(currentPair.sourceSubgraphSystemId, destinations);
    }
    const committedPairKeys = new Set(
      committedUsecase.subgraphPairs.map(currentPair =>
        directedPairKey(
          currentPair.sourceSubgraphSystemId,
          currentPair.destSubgraphSystemId,
        ),
      ),
    );
    const rewrites: MdfTopologyRewrite[] = [];
    const seenSegments = new Set<string>();

    for (const startId of survivingBoundaries) {
      if (
        !(pairsBySource.get(startId) ?? []).some(id => deletedMdfSet.has(id))
      ) {
        continue;
      }
      const path = findMdfChain(
        startId,
        pairsBySource,
        deletedMdfSet,
        usecaseMemberSet,
      );
      if (path === null) continue;

      const sourceId = path[0];
      const destId = path.at(-1)!;
      const mdfSubgraphSystemIds = path.slice(1, -1);
      const segmentKey = `${sourceId}:${destId}:${mdfSubgraphSystemIds.join(',')}`;
      // A shared chain must generate at most one rewrite for this UC.
      if (seenSegments.has(segmentKey)) continue;
      seenSegments.add(segmentKey);

      const directPair = pair(sourceId, destId);
      const directPairKey = directedPairKey(sourceId, destId);
      // A committed direct connection makes the chain redundant or ambiguous.
      if (committedPairKeys.has(directPairKey)) continue;
      if (
        inventory.committedDataLinksByDirectedPair.has(directPairKey) ||
        inventory.committedDataLinksByDirectedPair.has(
          directedPairKey(destId, sourceId),
        )
      ) {
        continue;
      }

      // Every logical chain edge needs committed physical-link evidence before
      // the analyzer can verify NORMAL/EC semantics.
      const committedPairs = path
        .slice(0, -1)
        .map((source, index) => pair(source, path[index + 1]));
      const chainLinkSets = committedPairs.map(
        currentPair =>
          inventory.committedDataLinksByDirectedPair.get(
            directedPairKey(
              currentPair.sourceSubgraphSystemId,
              currentPair.destSubgraphSystemId,
            ),
          ) ?? [],
      );
      if (chainLinkSets.some(links => links.length === 0)) continue;
      const chainLinkType = resolveSupportedMdfChainLinkType(chainLinkSets);
      if (chainLinkType === null) continue;
      const isEc = chainLinkType === DATA_LINK_TYPE.Ec;
      if (
        committedPairs.some(currentPair =>
          inventory.survivingDataLinkPairKeys.has(
            unorderedPairKey(
              currentPair.sourceSubgraphSystemId,
              currentPair.destSubgraphSystemId,
            ),
          ),
        )
      ) {
        continue;
      }

      // The session must add one forward direct link, with matching semantics,
      // and must not add the reverse direction at the same time.
      const directLinks =
        inventory.effectiveAddedDataLinksByDirectedPair.get(directPairKey) ??
        [];
      if (directLinks.length === 0) continue;
      if (
        (
          inventory.effectiveAddedDataLinksByDirectedPair.get(
            directedPairKey(destId, sourceId),
          ) ?? []
        ).length > 0
      ) {
        continue;
      }
      if (
        !directLinks.every(link =>
           link.linkType === chainLinkType,
        )
      ) {
        continue;
      }

      const removedPairKeys = new Set(
        committedPairs.map(currentPair =>
          directedPairKey(
            currentPair.sourceSubgraphSystemId,
            currentPair.destSubgraphSystemId,
          ),
        ),
      );
      const normalizedPairs = [
        ...committedUsecase.subgraphPairs.filter(
          currentPair =>
            !removedPairKeys.has(
              directedPairKey(
                currentPair.sourceSubgraphSystemId,
                currentPair.destSubgraphSystemId,
              ),
            ),
        ),
        directPair,
      ];
      const normalizedMembers = committedUsecase.subgraphSystemIds.filter(
        id => !deletedMdfSet.has(id),
      );
      // Do not preserve identity if the normalized topology changes its type.
      if (
        resultingType(normalizedMembers, normalizedPairs, isEc) !==
        committedUsecase.type
      ) {
        continue;
      }

      rewrites.push({
        kind: MDF_TOPOLOGY_REWRITE_KIND.MdfToDirect,
        directPair,
        mdfSubgraphSystemIds,
        committedPairs,
        normalizedPairs: [directPair],
      });
    }

    return rewrites;
  }
}
