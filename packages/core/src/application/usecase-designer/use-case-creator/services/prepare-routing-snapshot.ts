/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Result} from '../../../shared/result/result.js';
import {IssueRenderer} from '../../../issues/issue-renderer.js';
import {renderOrThrow} from '../../../issues/render-or-throw.js';
import type {UseCase} from '../../../../domain/entities/usecase-data/usecase/usecase.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {ActiveManualUsecaseEdit} from '../../../ports/persistence/repositories/usecase/usecase.repository.js';
import {
  type GraphEditSummary,
  type RoutingGraphSnapshot,
  type RoutingSelection,
} from '../contracts/routing-input.js';
import {validateAutoRoutingAdditionClosure} from '../shared/validate-routing-addition-closure.js';
import {RoutingGraphSnapshotBuilder} from './routing-graph-snapshot-builder.js';

export interface PrepareRoutingSnapshotParams {
  readonly fileSystemId: number;
  readonly selection: RoutingSelection;
  readonly selectedUsecases: readonly UseCase[];
  readonly graphEdits: GraphEditSummary;
  readonly activeManualUsecaseEdits: readonly ActiveManualUsecaseEdit[];
  readonly isManual: boolean;
}

/**
 * Shared preparation step used by both automatic and manual routing paths.
 *
 * 1. Removes subgraphs deleted in the current session from the active selection.
 * 2. Validates automatic-routing additions are closed under the requested scope.
 * 3. Builds and returns the immutable routing graph snapshot.
 *
 * Throws `DomainRuleViolationException` on any validation failure.
 */
export async function prepareRoutingSnapshot(
  params: PrepareRoutingSnapshotParams,
  snapshotBuilder: RoutingGraphSnapshotBuilder,
  uow: UnitOfWork,
): Promise<RoutingGraphSnapshot> {
  const deletedSubgraphIds = new Set(
    params.graphEdits.deletedSgs.map(subgraph => subgraph.systemId),
  );
  const effectiveActiveSubgraphs = params.selection.activeSubgraphs.filter(
    subgraph => !deletedSubgraphIds.has(subgraph.systemId),
  );

  if (!params.isManual) {
    const additionIssues = validateAutoRoutingAdditionClosure(
      params.selection,
      params.graphEdits,
    );
    if (additionIssues.length > 0)
      await renderOrThrow(
        Result.fail(...additionIssues),
        IssueRenderer.forUnitOfWork(uow),
      );
  }

  const snapshot = await renderOrThrow(
    await snapshotBuilder.build(
      {
        fileSystemId: params.fileSystemId,
        effectiveActiveSubgraphs,
        includedDataLinkSystemIds: params.selection.includedDataLinkSystemIds,
        includedControlLinkSystemIds:
          params.selection.includedControlLinkSystemIds,
        sessionEdits: params.graphEdits,
        activeManualUsecaseEdits: params.activeManualUsecaseEdits,
      },
      uow,
    ),
    IssueRenderer.forUnitOfWork(uow),
  );

  return snapshot.data;
}
