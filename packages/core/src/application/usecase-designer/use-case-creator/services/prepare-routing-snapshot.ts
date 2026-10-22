/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {DomainRuleViolationException} from '../../../../shared/exceptions/domain-rule-violation.exception.js';
import {RESULT_KIND} from '../../../shared/result/result.js';
import type {UseCase} from '../../../../domain/entities/usecase-data/usecase/usecase.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {ActiveManualUsecaseEdit} from '../../../ports/persistence/repositories/usecase/usecase.repository.js';
import {
  resolveActiveSubgraphSelection,
  type GraphEditSummary,
  type RoutingGraphSnapshot,
  type RoutingSelection,
} from '../contracts/routing-input.js';
import {RoutingIssueFactory} from '../issues/routing-issue-factory.js';
import {validateRoutingAdditionClosure} from '../shared/validate-routing-addition-closure.js';
import {RoutingGraphSnapshotBuilder} from './routing-graph-snapshot-builder.js';

export interface PrepareRoutingSnapshotParams {
  readonly fileSystemId: number;
  readonly selection: RoutingSelection;
  readonly selectedUsecases: readonly UseCase[];
  readonly graphEdits: GraphEditSummary;
  readonly activeManualUsecaseEdits: readonly ActiveManualUsecaseEdit[];
}

/**
 * Shared preparation step used by both automatic and manual routing paths.
 *
 * 1. Resolves the effective active-subgraph selection, reporting missing members.
 * 2. Validates that added graph entities are closed under the requested scope.
 * 3. Builds and returns the immutable routing graph snapshot.
 *
 * Throws `DomainRuleViolationException` on any validation failure.
 */
export async function prepareRoutingSnapshot(
  params: PrepareRoutingSnapshotParams,
  snapshotBuilder: RoutingGraphSnapshotBuilder,
  uow: UnitOfWork,
): Promise<RoutingGraphSnapshot> {
  const resolution = resolveActiveSubgraphSelection(
    params.selectedUsecases,
    params.selection.activeSubgraphs,
    params.selection.excludedSubgraphSystemIds,
    params.graphEdits.deletedSgs.map(sg => sg.systemId),
  );

  const additionIssues = validateRoutingAdditionClosure(
    params.selection,
    params.graphEdits,
  );
  if (additionIssues.length > 0)
    throw new DomainRuleViolationException(additionIssues);

  if (resolution.missingSelectedScopeSubgraphs.size > 0)
    throw new DomainRuleViolationException([
      RoutingIssueFactory.selectedScopeIncomplete(
        resolution.missingSelectedScopeSubgraphs,
      ),
    ]);

  const snapshot = await snapshotBuilder.build(
    {
      fileSystemId: params.fileSystemId,
      effectiveActiveSubgraphs: resolution.effectiveActiveSubgraphs,
      excludedDataLinkSystemIds: params.selection.excludedDataLinkSystemIds,
      excludedControlLinkSystemIds:
        params.selection.excludedControlLinkSystemIds,
      sessionEdits: params.graphEdits,
      activeManualUsecaseEdits: params.activeManualUsecaseEdits,
    },
    uow,
  );
  if (snapshot.kind === RESULT_KIND.Fail)
    throw new DomainRuleViolationException(snapshot.issues);

  return snapshot.data;
}
