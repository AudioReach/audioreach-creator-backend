/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ActiveManualUsecaseEdit} from '../../../ports/persistence/repositories/usecase/usecase.repository.js';
import type {RoutingGraphSnapshot} from '../contracts/routing-input.js';
import {
  RoutingIssueFactory,
  type ManualUsecaseDependencyMissing,
} from '../issues/routing-issue-factory.js';
import type {Issue} from '../../../../shared/issues/issue.js';

function sortedIds(ids: Iterable<number>): number[] {
  return [...new Set(ids)].sort((left, right) => left - right);
}

export class ManualUsecaseDependencyValidator {
  validate(
    edit: ActiveManualUsecaseEdit,
    graphSnapshot: RoutingGraphSnapshot,
  ): ManualUsecaseDependencyMissing | null {
    const referencedComponents = edit.referencedComponents;
    const effectiveUsecaseMissing = edit.usecase === null;
    const referencedComponentsMissing = referencedComponents === null;
    const effectiveSubgraphIds = new Set(edit.usecase?.subgraphSystemIds ?? []);
    const overlayDataLinkIds = new Set(
      graphSnapshot.overlayDataLinks.map(link => link.systemId),
    );
    const overlayControlLinkIds = new Set(
      graphSnapshot.overlayControlLinks.map(link => link.systemId),
    );
    const deletedSubgraphIds = new Set(
      graphSnapshot.sessionEdits.deletedSgs.map(subgraph => subgraph.systemId),
    );
    const deletedDataLinkIds = new Set(
      graphSnapshot.sessionEdits.deletedDataLinks.map(link => link.systemId),
    );
    const deletedControlLinkIds = new Set(
      graphSnapshot.sessionEdits.deletedControlLinks.map(link => link.systemId),
    );
    const referencedSubgraphIds = referencedComponents?.sgSystemIds ?? [];
    const referencedDataLinkIds = referencedComponents?.dataLinkSystemIds ?? [];
    const referencedControlLinkIds =
      referencedComponents?.controlLinkSystemIds ?? [];
    const missing: ManualUsecaseDependencyMissing = {
      effectiveUsecaseMissing,
      referencedComponentsMissing,
      subgraphSystemIds: sortedIds(
        referencedSubgraphIds.filter(
          id => !effectiveSubgraphIds.has(id) || deletedSubgraphIds.has(id),
        ),
      ),
      dataLinkSystemIds: sortedIds(
        referencedDataLinkIds.filter(
          id => !overlayDataLinkIds.has(id) || deletedDataLinkIds.has(id),
        ),
      ),
      controlLinkSystemIds: sortedIds(
        referencedControlLinkIds.filter(
          id => !overlayControlLinkIds.has(id) || deletedControlLinkIds.has(id),
        ),
      ),
    };
    return missing.effectiveUsecaseMissing ||
      missing.referencedComponentsMissing ||
      missing.subgraphSystemIds.length > 0 ||
      missing.dataLinkSystemIds.length > 0 ||
      missing.controlLinkSystemIds.length > 0
      ? missing
      : null;
  }

  run(
    edits: readonly ActiveManualUsecaseEdit[],
    graphSnapshot: RoutingGraphSnapshot,
  ): Issue[] {
    const issues: Issue[] = [];
    for (const edit of [...edits].sort(
      (left, right) => left.changeId - right.changeId,
    )) {
      const missing = this.validate(edit, graphSnapshot);
      if (missing !== null)
        issues.push(
          RoutingIssueFactory.manualUsecaseDependenciesBroken(edit, missing),
        );
    }
    return issues;
  }
}
