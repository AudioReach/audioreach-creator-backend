/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Issue} from '../../../../shared/issues/issue.js';
import {
  RoutingIssueFactory,
  type RoutingEditScopeConflictDetails,
} from '../issues/routing-issue-factory.js';
import type {
  ActiveSubgraphSelection,
  GraphEditSummary,
} from '../contracts/routing-input.js';
import {DATA_LINK_TYPE} from '../../../../domain/entities/usecase-data/links/data-link-type.js';

export interface RoutingAdditionClosureInput {
  readonly activeSubgraphs: readonly ActiveSubgraphSelection[];
  readonly excludedSubgraphSystemIds: readonly number[];
  readonly excludedDataLinkSystemIds: readonly number[];
  readonly excludedControlLinkSystemIds: readonly number[];
}

function intersection(
  candidates: ReadonlySet<number>,
  filter: ReadonlySet<number>,
): number[] {
  return [...candidates].filter(id => filter.has(id));
}

function difference(
  candidates: ReadonlySet<number>,
  filter: ReadonlySet<number>,
): number[] {
  return [...candidates].filter(id => !filter.has(id));
}

/**
 * Validates that every entity added in the current session is consistently
 * included in the requested routing scope.
 *
 * Returns one aggregated edit-scope issue containing every conflict, or an
 * empty array when the addition side of the routing request is valid. Added
 * data-link endpoints participate in scope closure; control-link endpoints
 * deliberately do not.
 */
export function validateRoutingAdditionClosure(
  input: RoutingAdditionClosureInput,
  graphEdits: GraphEditSummary,
): Issue[] {
  // Normalize request and edit collections into sets for closure comparisons.
  const requestedSubgraphIds = new Set(
    input.activeSubgraphs.map(subgraph => subgraph.systemId),
  );
  const excludedSubgraphIds = new Set(input.excludedSubgraphSystemIds);
  const excludedDataLinkIds = new Set(input.excludedDataLinkSystemIds);
  const excludedControlLinkIds = new Set(input.excludedControlLinkSystemIds);
  const deletedSubgraphIds = new Set(
    graphEdits.deletedSgs.map(subgraph => subgraph.systemId),
  );
  const addedSubgraphIds = new Set(
    graphEdits.addedSgs.map(subgraph => subgraph.systemId),
  );
  const addedDataLinks = graphEdits.addedDataLinks.filter(
    link => link.linkType === DATA_LINK_TYPE.Normal,
  );
  const addedDataLinkIds = new Set(addedDataLinks.map(link => link.systemId));
  const addedControlLinkIds = new Set(
    graphEdits.addedControlLinks.map(link => link.systemId),
  );
  const requiredEndpointIds = new Set<number>();
  // Only added intra-usecase data links require both endpoints in routing scope.
  for (const link of addedDataLinks) {
    requiredEndpointIds.add(link.sourceSubgraphSystemId);
    requiredEndpointIds.add(link.destSubgraphSystemId);
  }

  const details: RoutingEditScopeConflictDetails = {};
  const add = (
    key: keyof RoutingEditScopeConflictDetails,
    ids: readonly number[],
  ): void => {
    if (ids.length > 0)
      (details as Record<string, readonly number[]>)[key] = ids;
  };

  // Added entities cannot also be explicitly excluded from this routing run.
  add(
    'excludedAddedSubgraphSystemIds',
    intersection(addedSubgraphIds, excludedSubgraphIds),
  );
  add(
    'excludedAddedDataLinkSystemIds',
    intersection(addedDataLinkIds, excludedDataLinkIds),
  );
  add(
    'excludedAddedControlLinkSystemIds',
    intersection(addedControlLinkIds, excludedControlLinkIds),
  );

  // Every newly added subgraph must be present in the requested active scope.
  add(
    'missingAddedSubgraphSystemIds',
    difference(addedSubgraphIds, requestedSubgraphIds),
  );

  // Added data-link endpoints must be requested and cannot be excluded.
  add(
    'missingRequiredEndpointSubgraphSystemIds',
    difference(requiredEndpointIds, requestedSubgraphIds),
  );
  add(
    'excludedRequiredEndpointSubgraphSystemIds',
    intersection(requiredEndpointIds, excludedSubgraphIds),
  );

  // An added data link cannot depend on an endpoint deleted in the same session.
  add(
    'deletedAddedLinkEndpointSubgraphSystemIds',
    intersection(requiredEndpointIds, deletedSubgraphIds),
  );

  // Report all discovered conflicts together so callers can fix them in one pass.
  return Object.keys(details).length > 0
    ? [RoutingIssueFactory.editScopeConflict(details)]
    : [];
}
