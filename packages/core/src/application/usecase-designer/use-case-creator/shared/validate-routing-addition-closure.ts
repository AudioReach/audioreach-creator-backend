/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Validates that added graph entities are closed under the requested routing scope.
 *
 * Used by `AutoRoutingPreparationService` and `CreateManualUsecasesHandler`.
 */
import type {Issue} from '../../../../shared/issues/issue.js';
import {RoutingIssueFactory} from '../issues/routing-issue-factory.js';
import type {
  GraphEditSummary,
  RoutingSelection,
} from '../contracts/routing-input.js';

export type RoutingAdditionClosureInput = Pick<
  RoutingSelection,
  | 'activeSubgraphs'
  | 'includedDataLinkSystemIds'
  | 'includedControlLinkSystemIds'
>;

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
export function validateAutoRoutingAdditionClosure(
  input: RoutingAdditionClosureInput,
  graphEdits: GraphEditSummary,
): Issue[] {
  const requestedSubgraphIds = new Set(
    input.activeSubgraphs.map(subgraph => subgraph.systemId),
  );
  const includedDataLinkIds = new Set(input.includedDataLinkSystemIds);
  const includedControlLinkIds = new Set(input.includedControlLinkSystemIds);
  const deletedSubgraphIds = new Set(
    graphEdits.deletedSgs.map(sg => sg.systemId),
  );
  const deletedDataLinkIds = new Set(
    graphEdits.deletedDataLinks.map(link => link.systemId),
  );
  const deletedControlLinkIds = new Set(
    graphEdits.deletedControlLinks.map(link => link.systemId),
  );

  const effectiveAddedSubgraphIds = graphEdits.addedSgs
    .map(subgraph => subgraph.systemId)
    .filter(id => !deletedSubgraphIds.has(id));
  const effectiveAddedDataLinkIds = graphEdits.addedDataLinks
    .map(link => link.systemId)
    .filter(id => !deletedDataLinkIds.has(id));
  const effectiveAddedControlLinkIds = graphEdits.addedControlLinks
    .map(link => link.systemId)
    .filter(id => !deletedControlLinkIds.has(id));

  const missingAddedSubgraphSystemIds = difference(
    new Set(effectiveAddedSubgraphIds),
    requestedSubgraphIds,
  );
  const missingAddedDataLinkSystemIds = difference(
    new Set(effectiveAddedDataLinkIds),
    includedDataLinkIds,
  );
  const missingAddedControlLinkSystemIds = difference(
    new Set(effectiveAddedControlLinkIds),
    includedControlLinkIds,
  );

  if (
    missingAddedSubgraphSystemIds.length > 0 ||
    missingAddedDataLinkSystemIds.length > 0 ||
    missingAddedControlLinkSystemIds.length > 0
  ) {
    return [
      RoutingIssueFactory.additionScopeConflict({
        ...(missingAddedSubgraphSystemIds.length > 0 && {
          missingAddedSubgraphSystemIds,
        }),
        ...(missingAddedDataLinkSystemIds.length > 0 && {
          missingAddedDataLinkSystemIds,
        }),
        ...(missingAddedControlLinkSystemIds.length > 0 && {
          missingAddedControlLinkSystemIds,
        }),
      }),
    ];
  }

  return [];
}
