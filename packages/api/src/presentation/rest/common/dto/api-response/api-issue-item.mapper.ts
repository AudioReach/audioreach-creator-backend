/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ResultIssue} from '@arc/core';
import type {ApiIssueItem} from './api-issue-item.dto.js';

export function toApiIssueItem(issue: ResultIssue): ApiIssueItem {
  return {
    code: issue.code,
    message: issue.message,
    severity: issue.severity,
    ...(issue.category !== undefined && {category: issue.category}),
    ...(issue.impactedEntity !== undefined && {
      impactedEntity: {
        entityType: issue.impactedEntity.entityType,
        systemId: issue.impactedEntity.systemId,
        ...(issue.impactedEntity.displayName !== undefined && {
          displayName: issue.impactedEntity.displayName,
        }),
      },
    }),
    ...(issue.impactedUsecases !== undefined && {
      impactedUsecases: issue.impactedUsecases,
    }),
    ...(issue.fixOptions !== undefined && {
      fixOptions: issue.fixOptions.map(opt => ({
        id: opt.id,
        description: opt.description,
        commandType: opt.commandType,
        commandPayload: opt.commandPayload,
        requiredClientInputs: opt.requiredClientInputs.map(spec => ({
          field: spec.field,
          label: spec.label,
          type: spec.type,
        })),
      })),
    }),
  };
}

export function toApiIssueItems(
  issues: ResultIssue[] | undefined,
): ApiIssueItem[] | undefined {
  if (!issues || issues.length === 0) return undefined;
  return issues.map(issue => toApiIssueItem(issue));
}
