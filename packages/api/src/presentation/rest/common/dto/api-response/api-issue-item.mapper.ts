/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Issue} from '@arc/core';
import {ApiFixOptionDto} from './api-fix-option.dto.js';
import {ApiImpactedEntityDto, ApiIssueItem} from './api-issue-item.dto.js';

/**
 * Project a core `Issue` to its API-layer wire shape.
 *
 * Field-for-field projection (design §6.4, FR-4.8). Extra fields present on
 * subtypes such as `ValidationIssue` (`name`, `defaultSeverity`) are naturally
 * dropped — they do not appear on the base `Issue` interface and therefore
 * do not appear here.
 */
export function toApiIssueItem(issue: Issue): ApiIssueItem {
  const dto = new ApiIssueItem();
  dto.code = issue.code;
  dto.message = issue.message;
  dto.severity = issue.severity;
  if (issue.category !== undefined) dto.category = issue.category;
  if (issue.impactedEntity !== undefined) {
    const impactedItem = new ApiImpactedEntityDto();
    impactedItem.entityType = issue.impactedEntity.entityType;
    impactedItem.systemId = issue.impactedEntity.systemId;
    if (issue.impactedEntity.displayName !== undefined) {
      impactedItem.displayName = issue.impactedEntity.displayName;
    }
    dto.impactedEntity = impactedItem;
  }
  if (issue.impactedUsecases !== undefined) {
    dto.impactedUsecases = [...issue.impactedUsecases];
  }
  if (issue.fixOptions !== undefined && issue.fixOptions.length > 0) {
    dto.fixOptions = issue.fixOptions.map(fo => {
      const fixOptionDto = new ApiFixOptionDto();
      fixOptionDto.id = fo.id;
      fixOptionDto.description = fo.description;
      fixOptionDto.commandType = fo.commandType;
      fixOptionDto.commandPayload = fo.commandPayload;
      fixOptionDto.requiredClientInputs = fo.requiredClientInputs.map(spec => ({
        field: spec.field,
        label: spec.label,
        type: spec.type,
      }));
      return fixOptionDto;
    });
  }
  return dto;
}

/**
 * Convenience wrapper — projects an optional readonly array of `Issue`,
 * returning `undefined` for empty or missing input so `ApiResult<T>.issues`
 * stays absent rather than serialising `[]` on the wire (design §6.4).
 */
export function toApiIssueItems(
  issues?: readonly Issue[],
): ApiIssueItem[] | undefined {
  if (!issues || issues.length === 0) return undefined;
  return issues.map(issue => toApiIssueItem(issue));
}
