/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ControlLink} from '../../../../domain/entities/usecase-data/links/control-link.js';
import type {DataLink} from '../../../../domain/entities/usecase-data/links/data-link.js';
import type {SubgraphPair} from '../../../../application/ports/persistence/repositories/shared/links-for-pair.js';
import {
  createControlLinkManualTopologyPair,
  createDataLinkManualTopologyPair,
  type ManualTopologyPair,
} from '../contracts/routing-input.js';

/** Link collections used to resolve support for already-approved candidates. */
export interface ManualLinkSupportInput {
  readonly candidates: readonly SubgraphPair[];
  /** Final eligible links after request exclusions; these materialize pairs. */
  readonly dataLinks: readonly DataLink[];
  /**
   * Complete effective-overlay links before request-only exclusions. This is
   * evidence only: no overlay link means control fallback is allowed, while
   * overlay links with no eligible data link means data was excluded and
   * control fallback must be suppressed for that relationship.
   */
  readonly overlayDataLinks: readonly DataLink[];
  readonly controlLinks: readonly ControlLink[];
}

/**
 * Converts candidate relationships into ManualTopologyPairs using this
 * precedence: routable data, excluded-data evidence, then routable control.
 */
export class ManualLinkSupportResolver {
  resolve(input: ManualLinkSupportInput): readonly ManualTopologyPair[] {
    // Build each index once so candidate resolution is a map lookup rather
    // than a repeated scan through every link collection.
    const dataByPair = indexByUnorderedPair(input.dataLinks);
    const overlayDataByPair = indexByUnorderedPair(input.overlayDataLinks);
    const controlByPair = indexByUnorderedPair(input.controlLinks);
    const pairs: ManualTopologyPair[] = [];

    for (const candidate of input.candidates) {
      const key = unorderedPairKey(
        candidate.sourceSubgraphSystemId,
        candidate.destSubgraphSystemId,
      );
      const routableData = dataByPair.get(key) ?? [];
      if (routableData.length > 0) {
        // Data links retain their real direction. Opposite directions are
        // separate topology pairs, while same-direction links are grouped.
        const directionGroups = [
          ...groupByDirection(routableData).values(),
        ].sort(
          (left, right) =>
            left.pair.sourceSubgraphSystemId -
              right.pair.sourceSubgraphSystemId ||
            left.pair.destSubgraphSystemId - right.pair.destSubgraphSystemId,
        );
        for (const group of directionGroups) {
          pairs.push(
            createDataLinkManualTopologyPair(
              group.pair,
              [...group.links].sort(
                (left, right) => left.systemId - right.systemId,
              ),
            ),
          );
        }
        continue;
      }
      // Overlay-only data means support was excluded, so control fallback is
      // intentionally suppressed for this relationship only.
      if ((overlayDataByPair.get(key) ?? []).length > 0) continue;

      const supportingControlLinks = [...(controlByPair.get(key) ?? [])].sort(
        (left, right) => left.systemId - right.systemId,
      );
      if (supportingControlLinks.length > 0) {
        // Control topology is undirected at discovery time and is emitted in
        // the canonical numeric direction expected by its factory contract.
        pairs.push(
          createControlLinkManualTopologyPair(
            canonicalPair(candidate),
            supportingControlLinks,
          ),
        );
      }
    }
    return pairs;
  }
}

/** Common fields needed to index either link entity by subgraph endpoints. */
interface Link {
  readonly systemId: number;
  readonly sourceSubgraphSystemId: number;
  readonly destSubgraphSystemId: number;
}

/** One directed topology edge and all links supporting that exact direction. */
interface DirectionGroup<T extends Link> {
  readonly pair: SubgraphPair;
  readonly links: T[];
}

/** Groups links so each candidate can be resolved with one unordered-pair key. */
function indexByUnorderedPair<T extends Link>(
  links: readonly T[],
): Map<string, T[]> {
  const index = new Map<string, T[]>();
  for (const link of links) {
    const key = unorderedPairKey(
      link.sourceSubgraphSystemId,
      link.destSubgraphSystemId,
    );
    const values = index.get(key) ?? [];
    values.push(link);
    index.set(key, values);
  }
  return index;
}

/** Splits data support into directed groups within one unordered relationship. */
function groupByDirection<T extends Link>(
  links: readonly T[],
): Map<string, DirectionGroup<T>> {
  const groups = new Map<string, DirectionGroup<T>>();
  for (const link of links) {
    const key = `${link.sourceSubgraphSystemId}:${link.destSubgraphSystemId}`;
    const group = groups.get(key) ?? {
      pair: {
        sourceSubgraphSystemId: link.sourceSubgraphSystemId,
        destSubgraphSystemId: link.destSubgraphSystemId,
      },
      links: [],
    };
    group.links.push(link);
    groups.set(key, group);
  }
  return groups;
}

/** Normalizes a control relationship to ascending numeric endpoint order. */
function canonicalPair(pair: SubgraphPair): SubgraphPair {
  return {
    sourceSubgraphSystemId: Math.min(
      pair.sourceSubgraphSystemId,
      pair.destSubgraphSystemId,
    ),
    destSubgraphSystemId: Math.max(
      pair.sourceSubgraphSystemId,
      pair.destSubgraphSystemId,
    ),
  };
}

/** Identifies a relationship regardless of which endpoint appears first. */
function unorderedPairKey(left: number, right: number): string {
  return `${Math.min(left, right)}:${Math.max(left, right)}`;
}
