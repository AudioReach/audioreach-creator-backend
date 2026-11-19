/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  ENTITY_TYPE,
  type EntityType,
  type Issue,
  type LegacyIssue,
  type RenderedFixOption,
} from '@arc/core';
import {ApiFixOptionDto} from './api-fix-option.dto.js';
import {
  ApiEntityRef,
  ApiIssueItem,
  type ApiIssueParams,
  type ApiRelatedEntities,
} from './api-issue-item.dto.js';

/** An entity reference of a rendered or a legacy issue. */
type CoreEntityRef = {
  readonly entityType: EntityType;
  readonly systemId: number;
  readonly displayName?: string;
};

/**
 * Project a core issue to its API-layer wire shape. A rendered `Issue` maps
 * with all its context; a `LegacyIssue` has no `relatedEntities`, `params`
 * or fix-option `kind`, and its use cases are named by systemId only.
 * Empty `relatedEntities` and `params` are omitted.
 *
 * Extra fields on subtypes such as `ValidationIssue` (`name`,
 * `defaultSeverity`) are not projected.
 */
export function toApiIssueItem(issue: Issue | LegacyIssue): ApiIssueItem {
  const dto = new ApiIssueItem();
  dto.code = issue.code;
  dto.message = issue.message;
  dto.severity = issue.severity;
  if (issue.category !== undefined) dto.category = issue.category;
  if (issue.impactedEntity !== undefined) {
    dto.impactedEntity = toApiEntityRef(issue.impactedEntity);
  }
  if (isRendered(issue)) {
    Object.assign(dto, contextFields(issue));
    if (issue.impactedUsecases !== undefined) {
      dto.impactedUsecases = issue.impactedUsecases.map(ref =>
        toApiEntityRef(ref),
      );
    }
    if (issue.fixOptions !== undefined && issue.fixOptions.length > 0) {
      dto.fixOptions = issue.fixOptions.map(option =>
        Object.assign(
          fixOptionDto(option.id, option),
          {kind: option.kind as string},
          contextFields(option),
        ),
      );
    }
    return dto;
  }
  if (issue.impactedUsecases !== undefined) {
    dto.impactedUsecases = issue.impactedUsecases.map(systemId =>
      toApiEntityRef({entityType: ENTITY_TYPE.UseCase, systemId}),
    );
  }
  if (issue.fixOptions !== undefined && issue.fixOptions.length > 0) {
    dto.fixOptions = issue.fixOptions.map(option =>
      fixOptionDto(option.systemId, option),
    );
  }
  return dto;
}

/**
 * Convenience wrapper — projects an optional readonly array of issues,
 * returning `undefined` for empty or missing input so `ApiResult<T>.issues`
 * stays absent rather than serialising `[]` on the wire (design §6.4).
 */
export function toApiIssueItems(
  issues?: readonly (Issue | LegacyIssue)[],
): ApiIssueItem[] | undefined {
  if (!issues || issues.length === 0) return undefined;
  return issues.map(issue => toApiIssueItem(issue));
}

/** A rendered issue always has `relatedEntities`; a legacy one never has. */
function isRendered(issue: Issue | LegacyIssue): issue is Issue {
  return 'relatedEntities' in issue;
}

function toApiEntityRef(ref: CoreEntityRef): ApiEntityRef {
  const dto = new ApiEntityRef();
  dto.entityType = ref.entityType;
  dto.systemId = String(ref.systemId);
  if (ref.displayName !== undefined) dto.displayName = ref.displayName;
  return dto;
}

/** The fields shared by rendered and legacy fix options. */
function fixOptionDto(
  id: string,
  option: Pick<
    RenderedFixOption,
    'description' | 'commandType' | 'commandPayload' | 'requiredClientInputs'
  >,
): ApiFixOptionDto {
  const dto = new ApiFixOptionDto();
  dto.id = id;
  dto.description = option.description;
  dto.commandType = option.commandType;
  dto.commandPayload = {...option.commandPayload};
  dto.requiredClientInputs = option.requiredClientInputs.map(spec => ({
    field: spec.field,
    label: spec.label,
    type: spec.type,
  }));
  return dto;
}

/** `relatedEntities` and `params` on the wire, each omitted when empty. */
function contextFields(context: {
  readonly relatedEntities: object;
  readonly params: Readonly<ApiIssueParams>;
}): {relatedEntities?: ApiRelatedEntities; params?: ApiIssueParams} {
  const relatedEntities = mapRoles(context.relatedEntities);
  return {
    ...(Object.keys(relatedEntities).length > 0 && {relatedEntities}),
    ...(Object.keys(context.params).length > 0 && {
      params: {...context.params},
    }),
  };
}

/** Maps each role: one entity, a list of entities, or a list of groups. */
function mapRoles(roles: object): ApiRelatedEntities {
  return Object.fromEntries(
    Object.entries(roles)
      .filter(([, value]) => value !== undefined)
      .map(([role, value]) => [role, mapRoleValue(value)]),
  ) as ApiRelatedEntities;
}

function mapRoleValue(value: unknown): unknown {
  if (isEntityRef(value)) return toApiEntityRef(value);
  if (Array.isArray(value)) return value.map(item => mapRoleValue(item));
  return mapRoles(value as object);
}

/** A group has no `entityType`, so this tells a reference from a group. */
function isEntityRef(value: unknown): value is CoreEntityRef {
  return typeof value === 'object' && value !== null && 'entityType' in value;
}
