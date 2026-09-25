/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Issue} from '../../../../shared/issues/issue.js';
import {ISSUE_ENTITY_TYPE} from '../../../../shared/issues/impacted-entity.js';
import {ISSUE_CODE} from '../../../../shared/issues/operational-codes.js';
import {IssueSeverity} from '../../../../shared/issues/severity.js';
import type {DataLinkLossPair} from '../contracts/routing-state.js';
import {
  COLLISION_OPERAND_KIND,
  COLLISION_RESOLUTION_MODE,
  type CollisionResolutionMode,
  type SameGkvCollision,
} from '../contracts/same-gkv-collision.js';
import type {RoutingSelection} from '../contracts/routing-input.js';
import type {ActiveManualUsecaseEdit} from '../../../ports/persistence/repositories/usecase/usecase.repository.js';

/** Invalid dependencies referenced by an active manual UseCase edit. */
export interface ManualUsecaseDependencyMissing {
  /** The edit no longer resolves to an effective UseCase. */
  readonly effectiveUsecaseMissing: boolean;
  /** The edit has no component-reference metadata to validate. */
  readonly referencedComponentsMissing: boolean;
  /** Referenced subgraphs that are absent from the effective UseCase or deleted in this session. */
  readonly subgraphSystemIds: readonly number[];
  /** Referenced data links that are absent from the session overlay or deleted in this session. */
  readonly dataLinkSystemIds: readonly number[];
  /** Referenced control links that are absent from the session overlay or deleted in this session. */
  readonly controlLinkSystemIds: readonly number[];
}

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

export interface RoutingCombinationConflict {
  readonly keyDefSystemId: number;
  readonly conflictingSubgraphSystemIds: readonly [number, number];
}

export interface RoutingCombinationConflictDetails {
  readonly pathSubgraphSystemIds: readonly number[];
  readonly conflicts: readonly RoutingCombinationConflict[];
}

function sortedIds(ids: Iterable<number>): number[] {
  return [...ids].sort((left, right) => left - right);
}

interface CollisionTopologyDetails {
  readonly kind: SameGkvCollision['operands'][number]['kind'];
  readonly usecaseSystemId?: number;
  readonly subgraphSystemIds: readonly number[];
  readonly subgraphPairs: readonly {
    readonly sourceSubgraphSystemId: number;
    readonly destSubgraphSystemId: number;
  }[];
}

function collisionOperandDetails(
  operand: SameGkvCollision['operands'][number],
): CollisionTopologyDetails {
  const subgraphSystemIds =
    operand.kind === COLLISION_OPERAND_KIND.New
      ? operand.candidate.path.subgraphSystemIds
      : operand.usecase.subgraphSystemIds;
  const subgraphPairs =
    operand.kind === COLLISION_OPERAND_KIND.New
      ? operand.candidate.path.subgraphSystemIds
          .slice(1)
          .map((dest, index) => ({
            sourceSubgraphSystemId:
              operand.candidate.path.subgraphSystemIds[index],
            destSubgraphSystemId: dest,
          }))
      : operand.usecase.subgraphPairs;
  return {
    kind: operand.kind,
    ...(operand.kind === COLLISION_OPERAND_KIND.Existing
      ? {usecaseSystemId: operand.usecase.systemId}
      : {}),
    subgraphSystemIds: sortedIds(new Set(subgraphSystemIds)),
    subgraphPairs: [...subgraphPairs].sort(
      (left, right) =>
        left.sourceSubgraphSystemId - right.sourceSubgraphSystemId ||
        left.destSubgraphSystemId - right.destSubgraphSystemId,
    ),
  };
}

function mergeCollisionTopology(
  operands: readonly CollisionTopologyDetails[],
): CollisionTopologyDetails {
  const pairs = new Map<
    string,
    CollisionTopologyDetails['subgraphPairs'][number]
  >();
  for (const pair of operands.flatMap(operand => operand.subgraphPairs)) {
    pairs.set(
      `${pair.sourceSubgraphSystemId}>${pair.destSubgraphSystemId}`,
      pair,
    );
  }
  const existingUsecaseSystemId = operands.find(
    operand => operand.kind === COLLISION_OPERAND_KIND.Existing,
  )?.usecaseSystemId;
  return {
    kind:
      existingUsecaseSystemId === undefined
        ? COLLISION_OPERAND_KIND.New
        : COLLISION_OPERAND_KIND.Existing,
    ...(existingUsecaseSystemId === undefined
      ? {}
      : {usecaseSystemId: existingUsecaseSystemId}),
    subgraphSystemIds: sortedIds(
      new Set(operands.flatMap(operand => operand.subgraphSystemIds)),
    ),
    subgraphPairs: [...pairs.values()].sort(
      (left, right) =>
        left.sourceSubgraphSystemId - right.sourceSubgraphSystemId ||
        left.destSubgraphSystemId - right.destSubgraphSystemId,
    ),
  };
}

function selectedCollisionTopology(
  collision: SameGkvCollision,
  mode: CollisionResolutionMode,
): CollisionTopologyDetails {
  const operands: readonly [
    CollisionTopologyDetails,
    CollisionTopologyDetails,
  ] = [
    collisionOperandDetails(collision.operands[0]),
    collisionOperandDetails(collision.operands[1]),
  ];
  if (mode === COLLISION_RESOLUTION_MODE.PathB) return operands[1];
  if (mode === COLLISION_RESOLUTION_MODE.Merge)
    return mergeCollisionTopology(operands);
  if (mode === COLLISION_RESOLUTION_MODE.KeepExisting) {
    return (
      operands.find(
        operand => operand.kind === COLLISION_OPERAND_KIND.Existing,
      ) ?? operands[0]
    );
  }
  return operands[0];
}

function describeCollisionResolution(
  collision: SameGkvCollision,
  mode: CollisionResolutionMode,
): string {
  const topology = selectedCollisionTopology(collision, mode);
  const pairs = topology.subgraphPairs
    .map(pair => `${pair.sourceSubgraphSystemId}->${pair.destSubgraphSystemId}`)
    .join(', ');
  const topologyDescription =
    `SGs [${topology.subgraphSystemIds.join(', ')}]` + ` with pairs [${pairs}]`;
  const existingUsecaseSystemId = collision.operands.find(
    operand => operand.kind === COLLISION_OPERAND_KIND.Existing,
  )?.usecase.systemId;
  switch (mode) {
    case COLLISION_RESOLUTION_MODE.KeepExisting:
      return `Keep existing UseCase ${topology.usecaseSystemId ?? 'unknown'}: ${topologyDescription}.`;
    case COLLISION_RESOLUTION_MODE.ReplaceWithNew:
      return `Replace existing UseCase ${existingUsecaseSystemId ?? 'unknown'} with the new topology: ${topologyDescription}.`;
    case COLLISION_RESOLUTION_MODE.Merge:
      return existingUsecaseSystemId === undefined
        ? `Create the merged topology: ${topologyDescription}.`
        : `Update existing UseCase ${existingUsecaseSystemId} with the merged topology: ${topologyDescription}.`;
    case COLLISION_RESOLUTION_MODE.PathA:
      return `Create Path A: ${topologyDescription}.`;
    case COLLISION_RESOLUTION_MODE.PathB:
      return `Create Path B: ${topologyDescription}.`;
  }
}

function describeConflict(
  ids: readonly number[] | undefined,
  description: (formattedIds: string) => string,
): string | undefined {
  if (!ids || ids.length === 0) {
    return undefined;
  }
  return description(`[${sortedIds(ids).join(', ')}]`);
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
    const conflictMessages = [
      describeConflict(
        details.excludedAddedSubgraphSystemIds,
        ids =>
          `Subgraphs added by the request are explicitly excluded from the selected design: ${ids}. ` +
          'Include them in the selection, or remove those additions.',
      ),
      describeConflict(
        details.excludedAddedDataLinkSystemIds,
        ids =>
          `Data links added by the request are explicitly excluded from the selected design: ${ids}. ` +
          'Remove them from the exclusions, or remove those additions.',
      ),
      describeConflict(
        details.excludedAddedControlLinkSystemIds,
        ids =>
          `Control links added by the request are explicitly excluded from the selected design: ${ids}. ` +
          'Remove them from the exclusions, or remove those additions.',
      ),
      describeConflict(
        details.missingAddedSubgraphSystemIds,
        ids =>
          `Subgraphs needed to include the requested additions are missing from the selected design: ${ids}. ` +
          'Include them in the selection, or remove the related additions.',
      ),
      describeConflict(
        details.missingRequiredEndpointSubgraphSystemIds,
        ids =>
          `Subgraphs needed to keep the selected use cases complete are missing from the selected design: ${ids}. ` +
          'Include them in the selection.',
      ),
      describeConflict(
        details.excludedRequiredEndpointSubgraphSystemIds,
        ids =>
          `Subgraphs needed to keep the selected use cases complete were explicitly excluded: ${ids}. ` +
          'Remove them from the exclusions.',
      ),
      describeConflict(
        details.deletedAddedLinkEndpointSubgraphSystemIds,
        ids =>
          `A newly added link refers to subgraphs that are also being deleted: ${ids}. ` +
          'Remove the new link, or stop deleting those subgraphs.',
      ),
      describeConflict(
        details.excludedDeletedSubgraphSystemIds,
        ids =>
          `Subgraphs marked for deletion were explicitly excluded: ${ids}. ` +
          'Remove them from the exclusions, or cancel their deletion.',
      ),
      describeConflict(
        details.excludedDeletedDataLinkSystemIds,
        ids =>
          `Data links marked for deletion were explicitly excluded: ${ids}. ` +
          'Remove them from the exclusions, or cancel their deletion.',
      ),
      describeConflict(
        details.excludedDeletedControlLinkSystemIds,
        ids =>
          `Control links marked for deletion were explicitly excluded: ${ids}. ` +
          'Remove them from the exclusions, or cancel their deletion.',
      ),
      describeConflict(
        details.missingSurvivingEndpointSubgraphSystemIds,
        ids =>
          `Data links marked for deletion still use subgraphs that remain in the design, but those subgraphs are missing from the selected design: ${ids}. ` +
          'Include them in the selection.',
      ),
      describeConflict(
        details.excludedSurvivingEndpointSubgraphSystemIds,
        ids =>
          `Subgraphs still needed to validate the data-link deletion were explicitly excluded: ${ids}. ` +
          'Remove them from the exclusions.',
      ),
    ].filter((message): message is string => message !== undefined);

    const message = [
      'The requested changes cannot be safely applied because the selected design does not include everything needed to validate the result.',
      ...conflictMessages,
      'Update the selection or remove the conflicting changes, then submit the request again.',
    ].join(' ');

    return {
      code: ISSUE_CODE.ROUTING_PREVAL_EDIT_SCOPE_CONFLICT,
      message,
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

  cycleDetected(subgraphSystemId: number): Issue {
    return {
      code: ISSUE_CODE.ROUTING_CYCLE_DETECTED,
      severity: IssueSeverity.Warning,
      impactedEntity: {
        entityType: ISSUE_ENTITY_TYPE.Subgraph,
        systemId: subgraphSystemId,
      },
      message: `DFS detected a cycle at subgraph ${subgraphSystemId}.`,
    };
  },

  noValidCombination(details: RoutingCombinationConflictDetails): Issue {
    const normalized = details.conflicts.map(conflict => {
      const [firstSubgraphSystemId, secondSubgraphSystemId] =
        conflict.conflictingSubgraphSystemIds;
      return {
        keyDefSystemId: conflict.keyDefSystemId,
        conflictingSubgraphSystemIds: [
          Math.min(firstSubgraphSystemId, secondSubgraphSystemId),
          Math.max(firstSubgraphSystemId, secondSubgraphSystemId),
        ] as const,
      };
    });
    const unique = [
      ...new Map(
        normalized.map(conflict => [
          `${conflict.keyDefSystemId}:${conflict.conflictingSubgraphSystemIds[0]}:${conflict.conflictingSubgraphSystemIds[1]}`,
          conflict,
        ]),
      ).values(),
    ].sort(
      (left, right) =>
        left.keyDefSystemId - right.keyDefSystemId ||
        left.conflictingSubgraphSystemIds[0] -
          right.conflictingSubgraphSystemIds[0] ||
        left.conflictingSubgraphSystemIds[1] -
          right.conflictingSubgraphSystemIds[1],
    );
    const keyIds = [
      ...new Set(unique.map(conflict => conflict.keyDefSystemId)),
    ];
    const conflictText = unique
      .map(
        conflict =>
          `key ${conflict.keyDefSystemId}: subgraphs ` +
          `[${conflict.conflictingSubgraphSystemIds.join(', ')}]`,
      )
      .join('; ');

    return {
      code: ISSUE_CODE.ROUTING_DFS_NO_VALID_COMBINATION,
      severity: IssueSeverity.Error,
      message:
        `No conflict-free SGKV combination exists for path ` +
        `[${details.pathSubgraphSystemIds.join(', ')}]. ` +
        `keyDefinitionSystemIds: [${keyIds.join(', ')}]. ` +
        `Conflicts: ${conflictText}.`,
      ...(details.pathSubgraphSystemIds.length === 0
        ? {}
        : {
            impactedEntity: {
              entityType: ISSUE_ENTITY_TYPE.Subgraph,
              systemId: details.pathSubgraphSystemIds[0],
            },
          }),
    };
  },

  sgkvMalformed(
    subgraphSystemId: number,
    valueDefinitionSystemIds: Iterable<number>,
  ): Issue {
    const valueIds = sortedIds(new Set(valueDefinitionSystemIds));
    return {
      code: ISSUE_CODE.ROUTING_SGKV_MALFORMED,
      message:
        `SGKV input for subgraph ${subgraphSystemId} contains multiple values ` +
        `for one key (valueDefinitionSystemIds: [${valueIds.join(', ')}]).`,
      severity: IssueSeverity.Error,
      impactedEntity: {
        entityType: ISSUE_ENTITY_TYPE.Subgraph,
        systemId: subgraphSystemId,
      },
    };
  },

  sgkvValuesNotFound(
    subgraphSystemId: number,
    valueDefinitionSystemIds: Iterable<number>,
  ): Issue {
    const valueIds = sortedIds(new Set(valueDefinitionSystemIds));
    return {
      code: ISSUE_CODE.ROUTING_SGKV_VALUE_NOT_FOUND,
      message:
        `SGKV input for subgraph ${subgraphSystemId} references values that ` +
        `are missing from the effective file-scoped definitions ` +
        `(valueDefinitionSystemIds: [${valueIds.join(', ')}]).`,
      severity: IssueSeverity.Error,
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
        'Some use cases are affected by the requested changes, but they were not selected. ' +
        `Affected use case IDs: [${affectedIds.join(', ')}]. ` +
        `Missing from your selection: [${missingIds.join(', ')}]. ` +
        'Select all affected use cases and submit the request again.',
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

  manualUsecaseDependenciesBroken(
    edit: ActiveManualUsecaseEdit,
    missing: ManualUsecaseDependencyMissing,
  ): Issue {
    const missingParts = [
      missing.effectiveUsecaseMissing ? 'effective UseCase' : undefined,
      missing.referencedComponentsMissing
        ? 'referencedComponents metadata'
        : undefined,
      missing.subgraphSystemIds.length > 0
        ? `subgraphs [${sortedIds(missing.subgraphSystemIds).join(', ')}]`
        : undefined,
      missing.dataLinkSystemIds.length > 0
        ? `data links [${sortedIds(missing.dataLinkSystemIds).join(', ')}]`
        : undefined,
      missing.controlLinkSystemIds.length > 0
        ? `control links [${sortedIds(missing.controlLinkSystemIds).join(', ')}]`
        : undefined,
    ].filter((part): part is string => part !== undefined);
    const issue: Issue = {
      code: ISSUE_CODE.ROUTING_MANUAL_UC_BROKEN_DEPS,
      message:
        `Active MANUAL UseCase edit ${edit.changeId} has stale dependencies: ` +
        `${missingParts.join('; ')}. Remove the stale edit-action row and rerun routing.`,
      severity: IssueSeverity.Error,
      fixOptions: [
        {
          systemId: `remove-stale-manual-usecase-edit-${edit.changeId}`,
          description: 'Remove the stale MANUAL UseCase edit-action row.',
          commandType: 'RemoveStaleManualUsecaseEditCommand',
          commandPayload: {changeIds: [edit.changeId]},
          requiredClientInputs: [],
        },
      ],
    };
    if (edit.usecase !== null) {
      issue.impactedEntity = {
        entityType: ISSUE_ENTITY_TYPE.UseCase,
        systemId: edit.usecase.systemId,
      };
    }
    return issue;
  },

  sameGkvChoiceRequired(
    collision: SameGkvCollision,
    selection: RoutingSelection,
  ): Issue {
    const impactedUsecases = collision.operands
      .filter(
        (
          operand,
        ): operand is Extract<
          SameGkvCollision['operands'][number],
          {readonly kind: 'EXISTING'}
        > => operand.kind === 'EXISTING',
      )
      .map(operand => operand.usecase.systemId)
      .sort((left, right) => left - right);
    const collisionOperands = collision.operands.map(operand =>
      collisionOperandDetails(operand),
    );
    const issue: Issue = {
      code: ISSUE_CODE.ROUTING_SAME_GKV_CHOICE_REQUIRED,
      message: `Same-GKV collision ${collision.collisionId} requires a routing choice.`,
      severity: IssueSeverity.Error,
      fixOptions: collision.options.map(mode => ({
        systemId: `${collision.collisionId}-${mode}`,
        description: describeCollisionResolution(collision, mode),
        commandType: 'ResolveSameGkvCollisionCommand',
        commandPayload: {
          mode,
          collisionId: collision.collisionId,
          replayInput: selection,
          collisionOperands,
          selectedTopology: selectedCollisionTopology(collision, mode),
        },
        requiredClientInputs: [],
      })),
    };
    if (impactedUsecases.length > 0) issue.impactedUsecases = impactedUsecases;
    return issue;
  },

  sameGkvChoiceStale(collisionId: string): Issue {
    return {
      code: ISSUE_CODE.ROUTING_SAME_GKV_CHOICE_STALE,
      message: `Same-GKV collision ${collisionId} is no longer reproducible. Rerun routing.`,
      severity: IssueSeverity.Error,
    };
  },

  orphanSubgraph(systemId: number): Issue {
    return {
      code: ISSUE_CODE.ROUTING_ORPHAN_SUBGRAPH,
      message: `Subgraph ${systemId} is not referenced by any projected UseCase.`,
      severity: IssueSeverity.Warning,
      impactedEntity: {entityType: ISSUE_ENTITY_TYPE.Subgraph, systemId},
    };
  },

  orphanSubgraphHasKvs(systemId: number): Issue {
    return {
      code: ISSUE_CODE.ROUTING_ORPHAN_SG_HAS_KVS,
      message:
        `Orphan subgraph ${systemId} still has SGKVs. ` +
        'Review it through the manual topology workflow.',
      severity: IssueSeverity.Warning,
      impactedEntity: {entityType: ISSUE_ENTITY_TYPE.Subgraph, systemId},
    };
  },

  orphanSubsystem(systemId: number): Issue {
    return {
      code: ISSUE_CODE.ROUTING_ORPHAN_SUBSYSTEM,
      message: `Subsystem ${systemId} has no module in its hierarchy.`,
      severity: IssueSeverity.Warning,
      impactedEntity: {entityType: ISSUE_ENTITY_TYPE.Subsystem, systemId},
    };
  },

  orphanDataLink(systemId: number): Issue {
    return {
      code: ISSUE_CODE.ROUTING_ORPHAN_DATA_LINK,
      message: `Data link ${systemId} is not covered by any projected directed UseCase pair.`,
      severity: IssueSeverity.Warning,
      impactedEntity: {entityType: ISSUE_ENTITY_TYPE.DataLink, systemId},
    };
  },

  orphanControlLink(systemId: number): Issue {
    return {
      code: ISSUE_CODE.ROUTING_ORPHAN_CONTROL_LINK,
      message: `Control link ${systemId} is not covered by any projected UseCase pair.`,
      severity: IssueSeverity.Warning,
      impactedEntity: {entityType: ISSUE_ENTITY_TYPE.ControlLink, systemId},
    };
  },

  stagingPairEndpointMissing(
    sourceSubgraphSystemId: number,
    destSubgraphSystemId: number,
  ): Issue {
    return {
      code: ISSUE_CODE.ROUTING_STAGING_PAIR_ENDPOINT_MISSING,
      message:
        `Cannot stage UseCase pair ${sourceSubgraphSystemId}->${destSubgraphSystemId}: ` +
        'one or both subgraph endpoints are absent from the resulting UseCase.',
      severity: IssueSeverity.Error,
    };
  },
} as const;
