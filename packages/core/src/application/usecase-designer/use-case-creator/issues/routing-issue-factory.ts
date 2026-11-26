/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityRef} from '../../../../domain/identity/entity-identity.js';
import type {IssueFact} from '../../../../domain/issues/issue-fact.js';
import {ENTITY_TYPE} from '../../../../shared/entity-type.js';
import {ISSUE_CODE} from '../../../../shared/issues/operational-codes.js';
import {IssueSeverity} from '../../../../shared/issues/severity.js';
import type {
  DataLinkLossPair,
  ManualUsecaseCandidate,
} from '../contracts/routing-state.js';
import {
  COLLISION_ALTERNATIVE_KIND,
  COLLISION_RESOLUTION_MODE,
  type CollisionResolutionSelection,
  type SameGkvCollisionGroup,
} from '../contracts/same-gkv-collision.js';
import type {RoutingSelection} from '../contracts/routing-input.js';
import type {ActiveManualUsecaseEdit} from '../../../ports/persistence/repositories/usecase/usecase.repository.js';
import type {DirectedCycle} from '../shared/directed-cycle-detector.js';
import {
  candidatePairs,
  candidateSubgraphSystemIds,
} from '../shared/usecase-topology.js';

/** Components referenced by an active manual UseCase edit that no longer exist. */
export interface ManualUsecaseDependencyMissing {
  /** Referenced subgraphs that are absent from the effective UseCase or deleted in this session. */
  readonly subgraphSystemIds: readonly number[];
  /** Referenced data links that are absent from the session overlay or deleted in this session. */
  readonly dataLinkSystemIds: readonly number[];
  /** Referenced control links that are absent from the session overlay or deleted in this session. */
  readonly controlLinkSystemIds: readonly number[];
}

export interface RoutingAdditionScopeConflictDetails {
  readonly missingAddedSubgraphSystemIds?: readonly number[];
  readonly missingAddedDataLinkSystemIds?: readonly number[];
  readonly missingAddedControlLinkSystemIds?: readonly number[];
}

export interface UsecaseCandidateConflict {
  readonly keyDefSystemId: number;
  readonly conflictingSubgraphSystemIds: readonly [number, number];
}

export interface UsecaseCandidateConflictDetails {
  readonly pathSubgraphSystemIds: readonly number[];
  readonly conflicts: readonly UsecaseCandidateConflict[];
}

/** A node of a subsystem link chain: a module or a subsystem. */
export type ChainNodeRef = EntityRef<'SpfModule'> | EntityRef<'Subsystem'>;

/** The link types that can connect use cases. */
export type InterUsecaseLinkType =
  | typeof ENTITY_TYPE.DataLink
  | typeof ENTITY_TYPE.ControlLink;

function sortedIds(ids: Iterable<number>): number[] {
  return [...ids].sort((left, right) => left - right);
}

function subgraphRef(systemId: number): EntityRef<'Subgraph'> {
  return {entityType: ENTITY_TYPE.Subgraph, systemId};
}

function dataLinkRef(systemId: number): EntityRef<'DataLink'> {
  return {entityType: ENTITY_TYPE.DataLink, systemId};
}

function usecaseRef(systemId: number): EntityRef<'UseCase'> {
  return {entityType: ENTITY_TYPE.UseCase, systemId};
}

/** Subgraph refs in the given order, e.g. a path or a cycle. */
function subgraphPath(ids: readonly number[]): EntityRef<'Subgraph'>[] {
  return ids.map(id => subgraphRef(id));
}

/** Subgraph refs, deduplicated and sorted by systemId. */
function subgraphSet(ids: Iterable<number>): EntityRef<'Subgraph'>[] {
  return sortedIds(new Set(ids)).map(id => subgraphRef(id));
}

function dataLinkSet(ids: Iterable<number>): EntityRef<'DataLink'>[] {
  return sortedIds(new Set(ids)).map(id => dataLinkRef(id));
}

function controlLinkSet(ids: Iterable<number>): EntityRef<'ControlLink'>[] {
  return sortedIds(new Set(ids)).map(systemId => ({
    entityType: ENTITY_TYPE.ControlLink,
    systemId,
  }));
}

function valueSet(ids: Iterable<number>): EntityRef<'ValueDefinition'>[] {
  return sortedIds(new Set(ids)).map(systemId => ({
    entityType: ENTITY_TYPE.ValueDefinition,
    systemId,
  }));
}

function usecaseSet(ids: Iterable<number>): EntityRef<'UseCase'>[] {
  return sortedIds(new Set(ids)).map(id => usecaseRef(id));
}

interface CollisionTopologyDetails {
  readonly alternativeId: string;
  readonly kind: SameGkvCollisionGroup['alternatives'][number]['kind'];
  readonly usecaseSystemId?: number;
  readonly subgraphSystemIds: readonly number[];
  readonly subgraphPairs: readonly {
    readonly sourceSubgraphSystemId: number;
    readonly destSubgraphSystemId: number;
  }[];
}

function collisionAlternativeDetails(
  alternative: SameGkvCollisionGroup['alternatives'][number],
): CollisionTopologyDetails {
  const subgraphSystemIds =
    alternative.kind === COLLISION_ALTERNATIVE_KIND.New
      ? candidateSubgraphSystemIds(alternative.candidate)
      : alternative.usecase.subgraphSystemIds;
  const subgraphPairs =
    alternative.kind === COLLISION_ALTERNATIVE_KIND.New
      ? candidatePairs(alternative.candidate)
      : alternative.usecase.subgraphPairs;
  return {
    alternativeId: alternative.alternativeId,
    kind: alternative.kind,
    ...(alternative.kind === COLLISION_ALTERNATIVE_KIND.Existing
      ? {usecaseSystemId: alternative.usecase.systemId}
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
    operand => operand.kind === COLLISION_ALTERNATIVE_KIND.Existing,
  )?.usecaseSystemId;
  return {
    alternativeId: 'MERGE_ALL',
    kind:
      existingUsecaseSystemId === undefined
        ? COLLISION_ALTERNATIVE_KIND.New
        : COLLISION_ALTERNATIVE_KIND.Existing,
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
  collision: SameGkvCollisionGroup,
  selection: CollisionResolutionSelection,
): CollisionTopologyDetails {
  const alternatives = collision.alternatives.map(alternative =>
    collisionAlternativeDetails(alternative),
  );
  switch (selection.mode) {
    case COLLISION_RESOLUTION_MODE.MergeAll:
      return mergeCollisionTopology(alternatives);
    case COLLISION_RESOLUTION_MODE.KeepExisting:
      return alternatives.find(
        alternative => alternative.kind === COLLISION_ALTERNATIVE_KIND.Existing,
      )!;
    case COLLISION_RESOLUTION_MODE.SelectCandidate:
      return alternatives.find(
        alternative => alternative.alternativeId === selection.alternativeId,
      )!;
  }
}

function collisionResolutionSelections(
  collision: SameGkvCollisionGroup,
): CollisionResolutionSelection[] {
  const selections: CollisionResolutionSelection[] = collision.alternatives
    .filter(alternative => alternative.kind === COLLISION_ALTERNATIVE_KIND.New)
    .map(alternative => ({
      mode: COLLISION_RESOLUTION_MODE.SelectCandidate,
      collisionId: collision.collisionId,
      alternativeId: alternative.alternativeId,
    }));
  if (
    collision.alternatives.some(
      alternative => alternative.kind === COLLISION_ALTERNATIVE_KIND.Existing,
    )
  ) {
    selections.push({
      mode: COLLISION_RESOLUTION_MODE.KeepExisting,
      collisionId: collision.collisionId,
    });
  }
  selections.push({
    mode: COLLISION_RESOLUTION_MODE.MergeAll,
    collisionId: collision.collisionId,
  });
  return selections;
}

function collisionResolutionOptionId(
  collisionId: string,
  selection: CollisionResolutionSelection,
): string {
  if (selection.mode === COLLISION_RESOLUTION_MODE.SelectCandidate) {
    return `${collisionId}-${selection.mode}-${selection.alternativeId}`;
  }
  return `${collisionId}-${selection.mode}`;
}

/** A fix option of `ROUTING_SAME_GKV_CHOICE_REQUIRED`. */
type CollisionFixOption = NonNullable<
  IssueFact<typeof ISSUE_CODE.ROUTING_SAME_GKV_CHOICE_REQUIRED>['fixOptions']
>[number];

/** The fix option that applies `selection` to `collision`. */
function collisionFixOption(
  collision: SameGkvCollisionGroup,
  selection: CollisionResolutionSelection,
  replayInput: RoutingSelection,
  collisionAlternatives: readonly CollisionTopologyDetails[],
): CollisionFixOption {
  const topology = selectedCollisionTopology(collision, selection);
  const existingUsecaseSystemId = collision.alternatives.find(
    alternative => alternative.kind === COLLISION_ALTERNATIVE_KIND.Existing,
  )?.usecase.systemId;
  const usecase =
    existingUsecaseSystemId === undefined
      ? {}
      : {usecase: usecaseRef(existingUsecaseSystemId)};
  const subgraphs = subgraphSet(topology.subgraphSystemIds);
  const common = {
    id: collisionResolutionOptionId(collision.collisionId, selection),
    commandType: 'ResolveSameGkvCollisionCommand',
    commandPayload: {
      ...selection,
      replayInput,
      collisionAlternatives,
      selectedTopology: topology,
    },
    requiredClientInputs: [],
  };
  switch (selection.mode) {
    case COLLISION_RESOLUTION_MODE.SelectCandidate:
      return {
        ...common,
        kind: selection.mode,
        relatedEntities: {...usecase, subgraphs},
        params: {
          candidateNumber:
            collision.alternatives
              .filter(
                alternative =>
                  alternative.kind === COLLISION_ALTERNATIVE_KIND.New,
              )
              .findIndex(
                alternative =>
                  alternative.alternativeId === selection.alternativeId,
              ) + 1,
        },
      };
    case COLLISION_RESOLUTION_MODE.KeepExisting:
      return {
        ...common,
        kind: selection.mode,
        relatedEntities: {
          usecase: usecaseRef(topology.usecaseSystemId!),
          subgraphs,
        },
      };
    case COLLISION_RESOLUTION_MODE.MergeAll:
      return {
        ...common,
        kind: selection.mode,
        relatedEntities: {...usecase, subgraphs},
      };
  }
}

/** Creates issue facts owned by the use-case routing workflow. */
export const RoutingIssueFactory = {
  duplicateActiveSubgraphSelections(
    duplicateSubgraphSystemIds: Iterable<number>,
  ): IssueFact<
    typeof ISSUE_CODE.ROUTING_PREVAL_DUPLICATE_ACTIVE_SUBGRAPH_SELECTION
  > {
    return {
      code: ISSUE_CODE.ROUTING_PREVAL_DUPLICATE_ACTIVE_SUBGRAPH_SELECTION,
      severity: IssueSeverity.Error,
      relatedEntities: {subgraphs: subgraphSet(duplicateSubgraphSystemIds)},
    };
  },

  additionScopeConflict(
    details: RoutingAdditionScopeConflictDetails,
  ): IssueFact<typeof ISSUE_CODE.ROUTING_PREVAL_ADDITION_SCOPE_CONFLICT> {
    return {
      code: ISSUE_CODE.ROUTING_PREVAL_ADDITION_SCOPE_CONFLICT,
      severity: IssueSeverity.Error,
      relatedEntities: {
        subgraphs: subgraphSet(details.missingAddedSubgraphSystemIds ?? []),
        dataLinks: dataLinkSet(details.missingAddedDataLinkSystemIds ?? []),
        controlLinks: controlLinkSet(
          details.missingAddedControlLinkSystemIds ?? [],
        ),
      },
    };
  },

  dataLinkIntegrity(
    dataLinkSystemId: number,
    sourceSubgraphSystemId: number,
    destSubgraphSystemId: number,
  ): IssueFact<typeof ISSUE_CODE.ROUTING_PREVAL_DATALINK_INTEGRITY> {
    return {
      code: ISSUE_CODE.ROUTING_PREVAL_DATALINK_INTEGRITY,
      severity: IssueSeverity.Error,
      impactedEntity: dataLinkRef(dataLinkSystemId),
      relatedEntities: {
        source: subgraphRef(sourceSubgraphSystemId),
        destination: subgraphRef(destSubgraphSystemId),
      },
    };
  },

  mdfKvAssigned(
    subgraphSystemId: number,
  ): IssueFact<typeof ISSUE_CODE.ROUTING_MDF_KV_ASSIGNED> {
    return {
      code: ISSUE_CODE.ROUTING_MDF_KV_ASSIGNED,
      severity: IssueSeverity.Error,
      impactedEntity: subgraphRef(subgraphSystemId),
    };
  },

  islandDetected(
    subgraphSystemId: number,
  ): IssueFact<typeof ISSUE_CODE.ROUTING_ISLAND_DETECTED> {
    return {
      code: ISSUE_CODE.ROUTING_ISLAND_DETECTED,
      severity: IssueSeverity.Warning,
      impactedEntity: subgraphRef(subgraphSystemId),
    };
  },

  cycleDetected(
    subgraphSystemId: number,
  ): IssueFact<typeof ISSUE_CODE.ROUTING_CYCLE_DETECTED> {
    return {
      code: ISSUE_CODE.ROUTING_CYCLE_DETECTED,
      severity: IssueSeverity.Warning,
      impactedEntity: subgraphRef(subgraphSystemId),
    };
  },

  multipleEcConnectionsInUsecase(
    usecaseSystemId: number,
    ecDataLinkSystemIds: readonly number[],
    pairCount: number,
  ): IssueFact<typeof ISSUE_CODE.ROUTING_EC_MULTIPLE_LINKS> {
    return {
      code: ISSUE_CODE.ROUTING_EC_MULTIPLE_LINKS,
      severity: IssueSeverity.Error,
      impactedEntity: usecaseRef(usecaseSystemId),
      relatedEntities: {ecDataLinks: dataLinkSet(ecDataLinkSystemIds)},
      params: {pairCount},
    };
  },

  multipleEcConnectionsOnPath(
    pathSubgraphSystemIds: readonly number[],
    firstEcDataLinkSystemId: number,
    secondEcDataLinkSystemId: number,
  ): IssueFact<typeof ISSUE_CODE.ROUTING_EC_MULTIPLE_ON_PATH> {
    return {
      code: ISSUE_CODE.ROUTING_EC_MULTIPLE_ON_PATH,
      severity: IssueSeverity.Error,
      impactedEntity: dataLinkRef(secondEcDataLinkSystemId),
      relatedEntities: {
        path: subgraphPath(pathSubgraphSystemIds),
        firstEcDataLink: dataLinkRef(firstEcDataLinkSystemId),
        secondEcDataLink: dataLinkRef(secondEcDataLinkSystemId),
      },
    };
  },

  ecBridgeIncompatible(
    representativeDataLinkSystemId: number,
    subgraphSystemIds: readonly number[],
    dataLinkSystemIds: readonly number[],
    details: UsecaseCandidateConflictDetails,
  ): IssueFact<typeof ISSUE_CODE.ROUTING_EC_BRIDGE_INCOMPATIBLE> {
    return {
      code: ISSUE_CODE.ROUTING_EC_BRIDGE_INCOMPATIBLE,
      severity: IssueSeverity.Error,
      impactedEntity: dataLinkRef(representativeDataLinkSystemId),
      relatedEntities: {
        path: subgraphPath(subgraphSystemIds),
        ecDataLinks: dataLinkSystemIds.map(id => dataLinkRef(id)),
        keys: sortedIds(
          new Set(details.conflicts.map(conflict => conflict.keyDefSystemId)),
        ).map(systemId => ({entityType: ENTITY_TYPE.KeyDefinition, systemId})),
      },
    };
  },

  manualCycleDetected(
    cycle: DirectedCycle,
  ): IssueFact<typeof ISSUE_CODE.ROUTING_MANUAL_CYCLE> {
    return {
      code: ISSUE_CODE.ROUTING_MANUAL_CYCLE,
      severity: IssueSeverity.Error,
      relatedEntities: {
        cycle: subgraphPath(cycle.subgraphSystemIds),
        dataLinks: cycle.dataLinkSystemIds.map(id => dataLinkRef(id)),
      },
    };
  },

  noValidCombination(
    details: UsecaseCandidateConflictDetails,
  ): IssueFact<typeof ISSUE_CODE.ROUTING_DFS_NO_VALID_COMBINATION> {
    const normalized = details.conflicts.map(conflict => {
      const [first, second] = conflict.conflictingSubgraphSystemIds;
      return {
        keyDefSystemId: conflict.keyDefSystemId,
        subgraphSystemIds: [Math.min(first, second), Math.max(first, second)],
      };
    });
    const unique = [
      ...new Map(
        normalized.map(conflict => [
          `${conflict.keyDefSystemId}:${conflict.subgraphSystemIds.join(':')}`,
          conflict,
        ]),
      ).values(),
    ].sort(
      (left, right) =>
        left.keyDefSystemId - right.keyDefSystemId ||
        left.subgraphSystemIds[0] - right.subgraphSystemIds[0] ||
        left.subgraphSystemIds[1] - right.subgraphSystemIds[1],
    );
    const path = details.pathSubgraphSystemIds;
    return {
      code: ISSUE_CODE.ROUTING_DFS_NO_VALID_COMBINATION,
      severity: IssueSeverity.Error,
      ...(path.length === 0 ? {} : {impactedEntity: subgraphRef(path[0])}),
      relatedEntities: {
        path: subgraphPath(path),
        conflicts: unique.map(conflict => ({
          key: {
            entityType: ENTITY_TYPE.KeyDefinition,
            systemId: conflict.keyDefSystemId,
          },
          subgraphs: subgraphPath(conflict.subgraphSystemIds),
        })),
      },
    };
  },

  sgkvMalformed(
    subgraphSystemId: number,
    valueDefinitionSystemIds: Iterable<number>,
  ): IssueFact<typeof ISSUE_CODE.ROUTING_SGKV_MALFORMED> {
    return {
      code: ISSUE_CODE.ROUTING_SGKV_MALFORMED,
      severity: IssueSeverity.Error,
      impactedEntity: subgraphRef(subgraphSystemId),
      relatedEntities: {values: valueSet(valueDefinitionSystemIds)},
    };
  },

  sgkvValuesNotFound(
    subgraphSystemId: number,
    valueDefinitionSystemIds: Iterable<number>,
  ): IssueFact<typeof ISSUE_CODE.ROUTING_SGKV_VALUE_NOT_FOUND> {
    return {
      code: ISSUE_CODE.ROUTING_SGKV_VALUE_NOT_FOUND,
      severity: IssueSeverity.Error,
      impactedEntity: subgraphRef(subgraphSystemId),
      relatedEntities: {values: valueSet(valueDefinitionSystemIds)},
    };
  },

  deletionSelectionRequired(
    fullAffectedUsecaseSystemIds: ReadonlySet<number>,
    missingUsecaseSystemIds: ReadonlySet<number>,
  ): IssueFact<typeof ISSUE_CODE.ROUTING_DELETION_SELECTION_REQUIRED> {
    return {
      code: ISSUE_CODE.ROUTING_DELETION_SELECTION_REQUIRED,
      severity: IssueSeverity.Error,
      impactedUsecases: usecaseSet(fullAffectedUsecaseSystemIds),
      relatedEntities: {
        unselectedUsecases: usecaseSet(missingUsecaseSystemIds),
      },
    };
  },

  deletionScopeIncomplete(
    affectedUsecaseSystemIds: ReadonlySet<number>,
    missingSubgraphSystemIds: readonly number[],
    missingDataLinkSystemIds: readonly number[],
    missingControlLinkSystemIds: readonly number[],
  ): IssueFact<typeof ISSUE_CODE.ROUTING_DELETION_SCOPE_INCOMPLETE> {
    return {
      code: ISSUE_CODE.ROUTING_DELETION_SCOPE_INCOMPLETE,
      severity: IssueSeverity.Error,
      impactedUsecases: usecaseSet(affectedUsecaseSystemIds),
      relatedEntities: {
        subgraphs: subgraphSet(missingSubgraphSystemIds),
        dataLinks: dataLinkSet(missingDataLinkSystemIds),
        controlLinks: controlLinkSet(missingControlLinkSystemIds),
      },
    };
  },

  usecaseAutoIsland(
    usecaseSystemId: number,
    dataLinkLossPairs: readonly DataLinkLossPair[],
  ): IssueFact<typeof ISSUE_CODE.ROUTING_UC_AUTO_ISLAND> {
    const lostConnections = [...dataLinkLossPairs]
      .sort(
        (left, right) =>
          left.sourceSubgraphSystemId - right.sourceSubgraphSystemId ||
          left.destSubgraphSystemId - right.destSubgraphSystemId ||
          left.deletedDataLinkSystemId - right.deletedDataLinkSystemId,
      )
      .map(pair => ({
        source: subgraphRef(pair.sourceSubgraphSystemId),
        destination: subgraphRef(pair.destSubgraphSystemId),
        deletedDataLink: dataLinkRef(pair.deletedDataLinkSystemId),
      }));
    return {
      code: ISSUE_CODE.ROUTING_UC_AUTO_ISLAND,
      severity: IssueSeverity.Warning,
      impactedEntity: usecaseRef(usecaseSystemId),
      relatedEntities: {lostConnections},
    };
  },

  manualUsecaseDependenciesBroken(
    edit: ActiveManualUsecaseEdit,
    missing: ManualUsecaseDependencyMissing,
  ): IssueFact<typeof ISSUE_CODE.ROUTING_MANUAL_UC_BROKEN_DEPS> {
    return {
      code: ISSUE_CODE.ROUTING_MANUAL_UC_BROKEN_DEPS,
      severity: IssueSeverity.Error,
      ...(edit.usecase === null
        ? {}
        : {impactedEntity: usecaseRef(edit.usecase.systemId)}),
      relatedEntities: {
        subgraphs: subgraphSet(missing.subgraphSystemIds),
        dataLinks: dataLinkSet(missing.dataLinkSystemIds),
        controlLinks: controlLinkSet(missing.controlLinkSystemIds),
      },
      fixOptions: [
        {
          id: `delete-stale-manual-usecase-edit-${edit.changeId}`,
          kind: 'DELETE_STALE_EDIT',
          commandType: 'DeleteStaleManualUsecaseEditCommand',
          commandPayload: {changeIds: [edit.changeId]},
          requiredClientInputs: [],
        },
      ],
    };
  },

  sameGkvChoiceRequired(
    collision: SameGkvCollisionGroup,
    selection: RoutingSelection,
  ): IssueFact<typeof ISSUE_CODE.ROUTING_SAME_GKV_CHOICE_REQUIRED> {
    const impactedUsecases = usecaseSet(
      collision.alternatives.flatMap(alternative =>
        alternative.kind === COLLISION_ALTERNATIVE_KIND.Existing
          ? [alternative.usecase.systemId]
          : [],
      ),
    );
    const collisionAlternatives = collision.alternatives.map(alternative =>
      collisionAlternativeDetails(alternative),
    );
    return {
      code: ISSUE_CODE.ROUTING_SAME_GKV_CHOICE_REQUIRED,
      severity: IssueSeverity.Error,
      ...(impactedUsecases.length > 0 ? {impactedUsecases} : {}),
      relatedEntities: {gkvValues: valueSet(collision.gkvValueSystemIds)},
      params: {collisionId: collision.collisionId},
      fixOptions: collisionResolutionSelections(collision).map(resolution =>
        collisionFixOption(
          collision,
          resolution,
          selection,
          collisionAlternatives,
        ),
      ),
    };
  },

  multipleManualGkvOverrides(
    gkvValueSystemIds: readonly number[],
    edits: readonly ActiveManualUsecaseEdit[],
  ): IssueFact<typeof ISSUE_CODE.ROUTING_MULTIPLE_MANUAL_GKV_OVERRIDES> {
    return {
      code: ISSUE_CODE.ROUTING_MULTIPLE_MANUAL_GKV_OVERRIDES,
      severity: IssueSeverity.Error,
      impactedUsecases: usecaseSet(
        edits.flatMap(edit =>
          edit.usecase === null ? [] : [edit.usecase.systemId],
        ),
      ),
      relatedEntities: {gkvValues: valueSet(gkvValueSystemIds)},
    };
  },

  manualGkvConflict(
    gkvValueSystemIds: readonly number[],
    usecaseSystemIds: readonly number[],
    candidate: ManualUsecaseCandidate,
  ): IssueFact<typeof ISSUE_CODE.ROUTING_MANUAL_GKV_CONFLICT> {
    const impactedUsecases = usecaseSet(usecaseSystemIds);
    return {
      code: ISSUE_CODE.ROUTING_MANUAL_GKV_CONFLICT,
      severity: IssueSeverity.Error,
      ...(impactedUsecases.length > 0 ? {impactedUsecases} : {}),
      relatedEntities: {
        gkvValues: valueSet(gkvValueSystemIds),
        subgraphs: subgraphSet(candidateSubgraphSystemIds(candidate)),
      },
    };
  },

  sameGkvChoiceStale(
    collisionId: string,
  ): IssueFact<typeof ISSUE_CODE.ROUTING_SAME_GKV_CHOICE_STALE> {
    return {
      code: ISSUE_CODE.ROUTING_SAME_GKV_CHOICE_STALE,
      severity: IssueSeverity.Error,
      params: {collisionId},
    };
  },

  orphanSubgraph(
    systemId: number,
  ): IssueFact<typeof ISSUE_CODE.ROUTING_ORPHAN_SUBGRAPH> {
    return {
      code: ISSUE_CODE.ROUTING_ORPHAN_SUBGRAPH,
      severity: IssueSeverity.Warning,
      impactedEntity: subgraphRef(systemId),
    };
  },

  orphanSubgraphHasKvs(
    systemId: number,
  ): IssueFact<typeof ISSUE_CODE.ROUTING_ORPHAN_SG_HAS_KVS> {
    return {
      code: ISSUE_CODE.ROUTING_ORPHAN_SG_HAS_KVS,
      severity: IssueSeverity.Warning,
      impactedEntity: subgraphRef(systemId),
    };
  },

  orphanSubsystem(
    systemId: number,
  ): IssueFact<typeof ISSUE_CODE.ROUTING_ORPHAN_SUBSYSTEM> {
    return {
      code: ISSUE_CODE.ROUTING_ORPHAN_SUBSYSTEM,
      severity: IssueSeverity.Warning,
      impactedEntity: {entityType: ENTITY_TYPE.Subsystem, systemId},
    };
  },

  orphanDataLink(
    systemId: number,
  ): IssueFact<typeof ISSUE_CODE.ROUTING_ORPHAN_DATA_LINK> {
    return {
      code: ISSUE_CODE.ROUTING_ORPHAN_DATA_LINK,
      severity: IssueSeverity.Warning,
      impactedEntity: dataLinkRef(systemId),
    };
  },

  orphanControlLink(
    systemId: number,
  ): IssueFact<typeof ISSUE_CODE.ROUTING_ORPHAN_CONTROL_LINK> {
    return {
      code: ISSUE_CODE.ROUTING_ORPHAN_CONTROL_LINK,
      severity: IssueSeverity.Warning,
      impactedEntity: {entityType: ENTITY_TYPE.ControlLink, systemId},
    };
  },

  interUsecaseEndpointUncovered(
    linkType: InterUsecaseLinkType,
    linkSystemId: number,
    subgraphSystemId: number,
  ): IssueFact<typeof ISSUE_CODE.ROUTING_INTER_USECASE_ENDPOINT_UNCOVERED> {
    return {
      code: ISSUE_CODE.ROUTING_INTER_USECASE_ENDPOINT_UNCOVERED,
      severity: IssueSeverity.Error,
      impactedEntity: {entityType: linkType, systemId: linkSystemId},
      relatedEntities: {subgraph: subgraphRef(subgraphSystemId)},
    };
  },

  stagingPairEndpointMissing(
    sourceSubgraphSystemId: number,
    destSubgraphSystemId: number,
  ): IssueFact<typeof ISSUE_CODE.ROUTING_STAGING_PAIR_ENDPOINT_MISSING> {
    return {
      code: ISSUE_CODE.ROUTING_STAGING_PAIR_ENDPOINT_MISSING,
      severity: IssueSeverity.Error,
      relatedEntities: {
        source: subgraphRef(sourceSubgraphSystemId),
        destination: subgraphRef(destSubgraphSystemId),
      },
    };
  },

  incompleteDataChain(
    startModuleSystemId: number,
    lastReachableNode: ChainNodeRef,
  ): IssueFact<typeof ISSUE_CODE.ROUTING_PHASE0_INCOMPLETE_DATA_CHAIN> {
    return {
      code: ISSUE_CODE.ROUTING_PHASE0_INCOMPLETE_DATA_CHAIN,
      severity: IssueSeverity.Error,
      relatedEntities: {
        startModule: {
          entityType: ENTITY_TYPE.SpfModule,
          systemId: startModuleSystemId,
        },
        lastReachableNode,
      },
    };
  },

  incompleteControlChain(
    reachableNodes: readonly ChainNodeRef[],
  ): IssueFact<typeof ISSUE_CODE.ROUTING_PHASE0_INCOMPLETE_CONTROL_CHAIN> {
    return {
      code: ISSUE_CODE.ROUTING_PHASE0_INCOMPLETE_CONTROL_CHAIN,
      severity: IssueSeverity.Error,
      relatedEntities: {reachableNodes},
    };
  },
} as const;
