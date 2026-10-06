/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Result} from '../../../../../application/shared/result/result.js';
import type {ControlLink} from '../../../../../domain/entities/usecase-data/links/control-link.js';
import type {DataLink} from '../../../../../domain/entities/usecase-data/links/data-link.js';
import {
  USECASE_TOPOLOGY_DECISION_KIND,
  type UsecaseTopologyDecision,
} from '../../contracts/routing-state.js';
import {RoutingIssueFactory} from '../../issues/routing-issue-factory.js';
import {sortedIds} from './topology-impact-inventory.js';

export interface TopologyGateInput {
  readonly selectedUsecaseSystemIds: ReadonlySet<number>;
  readonly affectedUsecaseSystemIds: ReadonlySet<number>;
  readonly requestedSubgraphSystemIds: ReadonlySet<number>;
  readonly excludedSubgraphSystemIds: ReadonlySet<number>;
  readonly excludedDataLinkSystemIds: ReadonlySet<number>;
  readonly excludedControlLinkSystemIds: ReadonlySet<number>;
  readonly deletedSubgraphSystemIds: ReadonlySet<number>;
  readonly deletedDataLinks: readonly DataLink[];
  readonly deletedControlLinks: readonly ControlLink[];
}

interface DeletionSideConflicts {
  readonly excludedDeletedSubgraphSystemIds?: readonly number[];
  readonly excludedDeletedDataLinkSystemIds?: readonly number[];
  readonly excludedDeletedControlLinkSystemIds?: readonly number[];
  readonly missingSurvivingEndpointSubgraphSystemIds?: readonly number[];
  readonly excludedSurvivingEndpointSubgraphSystemIds?: readonly number[];
}

function hasAnyValues(conflicts: DeletionSideConflicts): boolean {
  return (
    (conflicts.excludedDeletedSubgraphSystemIds?.length ?? 0) > 0 ||
    (conflicts.excludedDeletedDataLinkSystemIds?.length ?? 0) > 0 ||
    (conflicts.excludedDeletedControlLinkSystemIds?.length ?? 0) > 0 ||
    (conflicts.missingSurvivingEndpointSubgraphSystemIds?.length ?? 0) > 0 ||
    (conflicts.excludedSurvivingEndpointSubgraphSystemIds?.length ?? 0) > 0
  );
}

function buildDeletionSideConflicts(
  input: TopologyGateInput,
): DeletionSideConflicts {
  // Deleted control-link endpoints intentionally do not expand automatic routing scope.
  const requiredSurvivingEndpointSubgraphSystemIds = new Set<number>();
  for (const dataLink of input.deletedDataLinks) {
    if (!input.deletedSubgraphSystemIds.has(dataLink.sourceSubgraphSystemId)) {
      requiredSurvivingEndpointSubgraphSystemIds.add(
        dataLink.sourceSubgraphSystemId,
      );
    }
    if (!input.deletedSubgraphSystemIds.has(dataLink.destSubgraphSystemId)) {
      requiredSurvivingEndpointSubgraphSystemIds.add(
        dataLink.destSubgraphSystemId,
      );
    }
  }

  const deletedDataLinkSystemIds = new Set(
    input.deletedDataLinks.map(link => link.systemId),
  );
  const deletedControlLinkSystemIds = new Set(
    input.deletedControlLinks.map(link => link.systemId),
  );
  const excludedDeletedSubgraphSystemIds = [
    ...input.deletedSubgraphSystemIds,
  ].filter(systemId => input.excludedSubgraphSystemIds.has(systemId));
  const excludedDeletedDataLinkSystemIds = [...deletedDataLinkSystemIds].filter(
    systemId => input.excludedDataLinkSystemIds.has(systemId),
  );
  const excludedDeletedControlLinkSystemIds = [
    ...deletedControlLinkSystemIds,
  ].filter(systemId => input.excludedControlLinkSystemIds.has(systemId));
  const missingSurvivingEndpointSubgraphSystemIds = [
    ...requiredSurvivingEndpointSubgraphSystemIds,
  ].filter(systemId => !input.requestedSubgraphSystemIds.has(systemId));
  const excludedSurvivingEndpointSubgraphSystemIds = [
    ...requiredSurvivingEndpointSubgraphSystemIds,
  ].filter(systemId => input.excludedSubgraphSystemIds.has(systemId));

  return {
    ...(excludedDeletedSubgraphSystemIds.length > 0 && {
      excludedDeletedSubgraphSystemIds: sortedIds(
        excludedDeletedSubgraphSystemIds,
      ),
    }),
    ...(excludedDeletedDataLinkSystemIds.length > 0 && {
      excludedDeletedDataLinkSystemIds: sortedIds(
        excludedDeletedDataLinkSystemIds,
      ),
    }),
    ...(excludedDeletedControlLinkSystemIds.length > 0 && {
      excludedDeletedControlLinkSystemIds: sortedIds(
        excludedDeletedControlLinkSystemIds,
      ),
    }),
    ...(missingSurvivingEndpointSubgraphSystemIds.length > 0 && {
      missingSurvivingEndpointSubgraphSystemIds: sortedIds(
        missingSurvivingEndpointSubgraphSystemIds,
      ),
    }),
    ...(excludedSurvivingEndpointSubgraphSystemIds.length > 0 && {
      excludedSurvivingEndpointSubgraphSystemIds: sortedIds(
        excludedSurvivingEndpointSubgraphSystemIds,
      ),
    }),
  };
}

export function deriveAffectedUsecaseSystemIds(
  decisions: readonly UsecaseTopologyDecision[],
): ReadonlySet<number> {
  const affected = new Set<number>();
  for (const decision of decisions) {
    if (decision.kind === USECASE_TOPOLOGY_DECISION_KIND.MdfSubstitution)
      continue;
    affected.add(decision.usecase.systemId);
  }
  return affected;
}

export function validateTopologyGates(
  input: TopologyGateInput,
): ReturnType<typeof Result.fail<void>> | null {
  // Gate ordering is part of the client contract: selection is reported before scope.
  const missingUsecaseSystemIds = new Set(
    [...input.affectedUsecaseSystemIds].filter(
      systemId => !input.selectedUsecaseSystemIds.has(systemId),
    ),
  );
  if (missingUsecaseSystemIds.size > 0) {
    return Result.fail<void>(
      RoutingIssueFactory.deletionSelectionRequired(
        input.affectedUsecaseSystemIds,
        missingUsecaseSystemIds,
      ),
    );
  }

  const conflicts = buildDeletionSideConflicts(input);
  if (hasAnyValues(conflicts)) {
    return Result.fail<void>(RoutingIssueFactory.editScopeConflict(conflicts));
  }
  return null;
}
