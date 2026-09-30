/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {IssueSeverity} from '@arc/core';
import type {Issue} from '@arc/core';
import type {MainTableEntityWriteOperation} from './apply-changes.types.js';

export const APPLY_ISSUE_CODE = {
  UnsupportedTarget: 'APPLY_UNSUPPORTED_TARGET',
  InvalidAction: 'APPLY_INVALID_ACTION',
  InvalidOperation: 'APPLY_INVALID_OPERATION',
  InvalidSpecialKey: 'APPLY_INVALID_SPECIAL_KEY',
  InvalidTargetMetadata: 'APPLY_INVALID_TARGET_METADATA',
  PersistenceFailed: 'APPLY_PERSISTENCE_FAILED',
} as const;

export const ApplyIssueFactory = {
  unsupportedTarget(entityName: string): Issue {
    return {
      code: APPLY_ISSUE_CODE.UnsupportedTarget,
      message: `Unsupported apply target: ${entityName}`,
      severity: IssueSeverity.Error,
    };
  },

  invalidAction(
    entityName: string,
    aggregateId: number,
    targetSystemId: number,
    reason: string,
  ): Issue {
    return {
      code: APPLY_ISSUE_CODE.InvalidAction,
      message:
        `Invalid apply action for ${entityName} ` +
        `(aggregateId=${aggregateId}, targetSystemId=${targetSystemId}): ${reason}`,
      severity: IssueSeverity.Error,
    };
  },

  invalidOperation(
    entityName: string,
    aggregateId: number,
    targetSystemId: number,
    operation: string,
  ): Issue {
    return {
      code: APPLY_ISSUE_CODE.InvalidOperation,
      message:
        `Invalid apply operation ${operation} for ${entityName} ` +
        `(aggregateId=${aggregateId}, targetSystemId=${targetSystemId})`,
      severity: IssueSeverity.Error,
    };
  },

  invalidSpecialKey(
    entityName: string,
    aggregateId: number,
    targetSystemId: number,
    reason: string,
  ): Issue {
    return {
      code: APPLY_ISSUE_CODE.InvalidSpecialKey,
      message:
        `Invalid composite apply key for ${entityName} ` +
        `(aggregateId=${aggregateId}, targetSystemId=${targetSystemId}): ${reason}`,
      severity: IssueSeverity.Error,
    };
  },

  invalidTargetMetadata(
    operation: MainTableEntityWriteOperation,
    reason: string,
  ): Issue {
    return {
      code: APPLY_ISSUE_CODE.InvalidTargetMetadata,
      message:
        `Invalid apply metadata for ${operation.target.entityName} ` +
        `(aggregateId=${operation.aggregateId}): ${reason}`,
      severity: IssueSeverity.Error,
    };
  },

  persistenceFailed(
    operation: MainTableEntityWriteOperation,
    reason: string,
  ): Issue {
    return {
      code: APPLY_ISSUE_CODE.PersistenceFailed,
      message:
        `Apply persistence failed for ${operation.target.entityName} ` +
        `(aggregateId=${operation.aggregateId}, ` +
        `row=${JSON.stringify(operation.target.rowIdentifier.values)}): ${reason}`,
      severity: IssueSeverity.Error,
    };
  },
} as const;
