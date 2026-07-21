/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Issue} from './issue.js';
import {IssueSeverity, IssueCategory} from './severity.js';
import type {IssueEntityType, ImpactedEntity} from './impacted-entity.js';
import {ISSUE_ENTITY_TYPE} from './impacted-entity.js';
import type {FixOption} from './fix-option.js';
import {ISSUE_CODE} from './operational-codes.js';

/**
 * Factory functions for constructing operational Issues.
 *
 * Named IssueFactory (not Issue.notFound) because Issue is a type — TypeScript
 * cannot attach static methods to an interface.
 *
 * Ship-in-v1 set: notFound, dbError, parseError, dataLoss. Extend as new
 * operational categories emerge. Design §2.6, FR-4.6.
 */
export const IssueFactory = {
  notFound(
    entityType: IssueEntityType,
    systemId: number,
    displayName?: string,
  ): Issue {
    return {
      code: ISSUE_CODE.ENTITY_NOT_FOUND,
      message: `${entityType} not found (systemId: ${systemId})`,
      severity: IssueSeverity.Error,
      impactedEntity: {
        entityType,
        systemId,
        ...(displayName && {displayName}),
      },
    };
  },

  dbError(message: string, impactedEntity?: ImpactedEntity): Issue {
    return {
      code: ISSUE_CODE.DB_QUERY_FAILED,
      message,
      severity: IssueSeverity.Error,
      ...(impactedEntity && {impactedEntity}),
    };
  },

  parseError(code: string, message: string): Issue {
    return {
      code,
      message,
      severity: IssueSeverity.Error,
    };
  },

  dataLoss(
    code: string,
    message: string,
    impactedEntity: ImpactedEntity,
    fixOptions?: FixOption[],
  ): Issue {
    return {
      code,
      message,
      severity: IssueSeverity.Warning,
      category: IssueCategory.DataLoss,
      impactedEntity,
      ...(fixOptions && fixOptions.length > 0 && {fixOptions}),
    };
  },

  containerTypeIncompatible(
    containerSystemId: number,
    containerTypeSystemId: number | null,
    allowedTypeIds: number[],
  ): Issue {
    return {
      code: ISSUE_CODE.MOD_CONTAINER_TYPE_INCOMPATIBLE,
      message:
        `Container ${containerSystemId} has type ${containerTypeSystemId ?? 'unknown'} ` +
        `which is not in the module definition's allowed types: [${allowedTypeIds.join(', ')}].`,
      severity: IssueSeverity.Error,
      impactedEntity: {
        entityType: ISSUE_ENTITY_TYPE.Container,
        systemId: containerSystemId,
      },
    };
  },

  containerPropMismatch(containerSystemId: number): Issue {
    return {
      code: ISSUE_CODE.MOD_CONTAINER_PROP_MISMATCH,
      message:
        `Container ${containerSystemId} has properties that do not match the current ` +
        `container (excluding stack size). Move the module to a container with identical ` +
        `non-structural properties, or use an empty container ID to auto-create one.`,
      severity: IssueSeverity.Error,
      impactedEntity: {
        entityType: ISSUE_ENTITY_TYPE.Container,
        systemId: containerSystemId,
      },
    };
  },

  portCountExceedsDefinition(
    portDirection: string,
    requested: number,
    max: number,
    moduleSystemId: number,
  ): Issue {
    return {
      code: ISSUE_CODE.MOD_PORT_COUNT_EXCEEDS_DEFINITION,
      message:
        `Requested ${portDirection.toLowerCase()} port count ${requested} exceeds ` +
        `module definition limit ${max}.`,
      severity: IssueSeverity.Error,
      impactedEntity: {
        entityType: ISSUE_ENTITY_TYPE.SpfModule,
        systemId: moduleSystemId,
      },
    };
  },

  portCountDecreaseBlocked(
    portSystemId: number,
    portEntityType: IssueEntityType,
    linkSystemIds: number[],
  ): Issue {
    return {
      code: ISSUE_CODE.MOD_PORT_COUNT_DECREASE_BLOCKED,
      message:
        `Cannot remove port ${portSystemId} — it has ${linkSystemIds.length} active ` +
        `link(s) attached (linkSystemIds: [${linkSystemIds.join(', ')}]). ` +
        `Delete the link(s) first.`,
      severity: IssueSeverity.Error,
      impactedEntity: {entityType: portEntityType, systemId: portSystemId},
    };
  },

  noAvailableIntents(
    moduleSystemId: number,
    toAdd: number,
    available: number,
  ): Issue {
    return {
      code: ISSUE_CODE.MOD_NO_AVAILABLE_INTENTS,
      message:
        `Cannot add ${toAdd} control port(s) — only ${available} dynamic intent(s) ` +
        `are available (all others are already allocated). Free up intents first.`,
      severity: IssueSeverity.Error,
      impactedEntity: {
        entityType: ISSUE_ENTITY_TYPE.SpfModule,
        systemId: moduleSystemId,
      },
    };
  },

  portCountBelowStaticMinimum(
    moduleSystemId: number,
    requested: number,
    staticCount: number,
    portEntityType: IssueEntityType,
  ): Issue {
    return {
      code: ISSUE_CODE.MOD_PORT_COUNT_BELOW_STATIC_MINIMUM,
      message:
        `Requested port count ${requested} is below the module's static port count ` +
        `${staticCount}. Static ports are fixed by the module definition and cannot be removed.`,
      severity: IssueSeverity.Error,
      impactedEntity: {
        entityType: portEntityType,
        systemId: moduleSystemId,
      },
    };
  },

  selfLoop(nodeId: number): Issue {
    return {
      code: ISSUE_CODE.CL_SELF_LOOP,
      message: `Source and destination are the same node (systemId: ${nodeId}). Self-loops are not allowed.`,
      severity: IssueSeverity.Error,
    };
  },

  subsystemNotAllowedOnFlatView(nodeId: number): Issue {
    return {
      code: ISSUE_CODE.CL_SUBSYSTEM_FLAT_VIEW,
      message: `Subsystem node ${nodeId} is not allowed on POST /control-links. Use POST /control-links/with-subsystems.`,
      severity: IssueSeverity.Error,
    };
  },

  duplicateControlLink(portA: number, portB: number): Issue {
    return {
      code: ISSUE_CODE.CL_DUPLICATE,
      message: `A non-deleted control link already exists between ports ${portA} and ${portB}.`,
      severity: IssueSeverity.Error,
    };
  },

  emptyIntentIntersection(portA: number, portB: number): Issue {
    return {
      code: ISSUE_CODE.CL_EMPTY_INTENT_INTERSECTION,
      message: `No common intents between ports ${portA} and ${portB}. Cannot create control link.`,
      severity: IssueSeverity.Error,
    };
  },

  usecaseMismatch(nodeA: number, nodeB: number): Issue {
    return {
      code: ISSUE_CODE.CL_USECASE_MISMATCH,
      message: `Nodes ${nodeA} and ${nodeB} do not satisfy the isInterUsecase requirement.`,
      severity: IssueSeverity.Error,
    };
  },

  subsystemPortSideConflict(portSystemId: number): Issue {
    return {
      code: ISSUE_CODE.CL_SUBSYSTEM_PORT_SIDE_CONFLICT,
      message:
        `Control port ${portSystemId} belongs to a subsystem and already has a connection ` +
        `on the same side (inner or outer) as the new link. ` +
        `A subsystem port can carry at most one inner-side and one outer-side connection.`,
      severity: IssueSeverity.Error,
    };
  },
} as const;
