/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Issue} from '../../../../shared/issues/issue.js';
import {ISSUE_ENTITY_TYPE} from '../../../../shared/issues/impacted-entity.js';
import {ISSUE_CODE} from '../../../../shared/issues/operational-codes.js';
import {IssueSeverity} from '../../../../shared/issues/severity.js';
import type {DataLinkLossPair} from '../contracts/routing-state.js';

export interface RoutingEditScopeConflictDetails {
  readonly excludedAddedSubgraphSystemIds?: readonly number[];
  readonly excludedAddedDataLinkSystemIds?: readonly number[];
  readonly excludedAddedControlLinkSystemIds?: readonly number[];
  readonly missingAddedSubgraphSystemIds?: readonly number[];
  readonly missingRequiredEndpointSubgraphSystemIds?: readonly number[];
  readonly excludedRequiredEndpointSubgraphSystemIds?: readonly number[];
  readonly deletedAddedLinkEndpointSubgraphSystemIds?: readonly number[];
  readonly excludedDeletedSubgraphSystemIds?: readonly number[];
  readonly excludedDeletedDataLinkSystemIds?: readonly number[];
  readonly excludedDeletedControlLinkSystemIds?: readonly number[];
  readonly missingSurvivingEndpointSubgraphSystemIds?: readonly number[];
  readonly excludedSurvivingEndpointSubgraphSystemIds?: readonly number[];
}

function sortedIds(ids: Iterable<number>): number[] {
  return [...ids].sort((left, right) => left - right);
}

/** Creates issues owned by the use-case routing workflow. */
export const RoutingIssueFactory = {
  duplicateActiveSubgraphSelections(
    duplicateSubgraphSystemIds: Iterable<number>,
  ): Issue {
    const duplicateIds = sortedIds(duplicateSubgraphSystemIds);
    return {
      code: ISSUE_CODE.ROUTING_PREVAL_DUPLICATE_ACTIVE_SUBGRAPH_SELECTION,
      message:
        'Duplicate active-subgraph selections are not allowed ' +
        `(systemIds: [${duplicateIds.join(', ')}]).`,
      severity: IssueSeverity.Error,
    };
  },

  selectedScopeIncomplete(
    missingSubgraphSystemIds: ReadonlySet<number>,
  ): Issue {
    const missingIds = [...missingSubgraphSystemIds];
    return {
      code: ISSUE_CODE.ROUTING_PREVAL_SCOPE_INCOMPLETE,
      message:
        'Every selected usecase subgraph must be included in the routing input ' +
        'unless explicitly excluded or deleted in the current session ' +
        `(missing subgraphSystemIds: [${missingIds.join(', ')}]).`,
      severity: IssueSeverity.Error,
    };
  },

  editScopeConflict(details: RoutingEditScopeConflictDetails): Issue {
    const conflictText = Object.entries(details)
      .filter(
        (entry): entry is [string, readonly number[]] =>
          Array.isArray(entry[1]) && entry[1].length > 0,
      )
      .map(([name, ids]) => `${name}=[${sortedIds(ids).join(', ')}]`)
      .join('; ');
    const conflictSuffix = conflictText ? `: ${conflictText}` : '';
    return {
      code: ISSUE_CODE.ROUTING_PREVAL_EDIT_SCOPE_CONFLICT,
      message: `Routing edit scope conflicts${conflictSuffix}.`,
      severity: IssueSeverity.Error,
    };
  },

  dataLinkIntegrity(
    dataLinkSystemId: number,
    sourceSubgraphSystemId: number,
    destSubgraphSystemId: number,
  ): Issue {
    return {
      code: ISSUE_CODE.ROUTING_PREVAL_DATALINK_INTEGRITY,
      message:
        `Intra-usecase data link ${dataLinkSystemId} references a missing endpoint ` +
        `(sourceSubgraphSystemId: ${sourceSubgraphSystemId}, ` +
        `destSubgraphSystemId: ${destSubgraphSystemId}).`,
      severity: IssueSeverity.Error,
      impactedEntity: {
        entityType: ISSUE_ENTITY_TYPE.DataLink,
        systemId: dataLinkSystemId,
      },
    };
  },

  islandDetected(subgraphSystemId: number): Issue {
    return {
      code: ISSUE_CODE.ROUTING_ISLAND_DETECTED,
      message:
        `Subgraph ${subgraphSystemId} has no effective intra-usecase ` +
        'data-link adjacency.',
      severity: IssueSeverity.Warning,
      impactedEntity: {
        entityType: ISSUE_ENTITY_TYPE.Subgraph,
        systemId: subgraphSystemId,
      },
    };
  },

  deletionSelectionRequired(
    fullAffectedUsecaseSystemIds: ReadonlySet<number>,
    missingUsecaseSystemIds: ReadonlySet<number>,
  ): Issue {
    const affectedIds = sortedIds(fullAffectedUsecaseSystemIds);
    const missingIds = sortedIds(missingUsecaseSystemIds);
    return {
      code: ISSUE_CODE.ROUTING_DELETION_SELECTION_REQUIRED,
      message:
        'Every affected usecase must be selected ' +
        `(fullAffectedUsecaseSystemIds: [${affectedIds.join(', ')}], ` +
        `missingUsecaseSystemIds: [${missingIds.join(', ')}]).`,
      severity: IssueSeverity.Error,
      impactedUsecases: affectedIds,
    };
  },

  usecaseAutoIsland(
    usecaseSystemId: number,
    dataLinkLossPairs: readonly DataLinkLossPair[],
  ): Issue {
    const pairText = [...dataLinkLossPairs]
      .sort(
        (left, right) =>
          left.sourceSubgraphSystemId - right.sourceSubgraphSystemId ||
          left.destSubgraphSystemId - right.destSubgraphSystemId ||
          left.deletedDataLinkSystemId - right.deletedDataLinkSystemId,
      )
      .map(
        pair =>
          `${pair.sourceSubgraphSystemId}->${pair.destSubgraphSystemId} ` +
          `via deleted dataLink ${pair.deletedDataLinkSystemId}`,
      )
      .join(', ');
    return {
      code: ISSUE_CODE.ROUTING_UC_AUTO_ISLAND,
      message:
        `Usecase ${usecaseSystemId} changed to ISLAND because data-link ` +
        `coverage was lost (dataLinkLossPairs: [${pairText}]).`,
      severity: IssueSeverity.Warning,
      impactedEntity: {
        entityType: ISSUE_ENTITY_TYPE.UseCase,
        systemId: usecaseSystemId,
      },
    };
  },
} as const;
