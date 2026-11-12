/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {FailedEntity} from '../../ports/persistence/batch-read.js';
import {FAILED_ENTITY_REASON} from '../../ports/persistence/batch-read.js';
import type {EntityRef} from '../../../domain/identity/entity-identity.js';
import {IdentityFormatter} from '../../issues/identity-formatter.js';
import type {Issue} from '../../../shared/issues/issue.js';
import type {IssueEntityType} from '../../../shared/issues/impacted-entity.js';
import {ISSUE_CODE} from '../../../shared/issues/operational-codes.js';
import {IssueSeverity} from '../../../shared/issues/severity.js';

const formatter = new IdentityFormatter();

/**
 * Turns the `failed` list of a `BatchRead` into issues, so a query
 * handler can return `Result.partial(items, issues)`.
 *
 * Text shows the entity's natural identity when the read supplied it,
 * otherwise the `systemId` fallback; `impactedEntity` keeps the systemId.
 */
export function failedToIssues<E extends IssueEntityType>(
  entityType: E,
  failed: readonly FailedEntity<E>[],
): Issue[] {
  return failed.map(entity => failedEntityToIssue(entityType, entity));
}

function failedEntityToIssue<E extends IssueEntityType>(
  entityType: E,
  entity: FailedEntity<E>,
): Issue {
  const ref = {
    entityType,
    systemId: entity.systemId,
    ...(entity.identity && {identity: entity.identity}),
  } as EntityRef;
  const displayName = formatter.format(ref);
  const impactedEntity = {entityType, systemId: entity.systemId, displayName};

  if (entity.reason === FAILED_ENTITY_REASON.NotFound) {
    return {
      code: ISSUE_CODE.ENTITY_NOT_FOUND,
      message: `${displayName} was not found in this project.`,
      severity: IssueSeverity.Error,
      impactedEntity,
    };
  }
  const reason =
    entity.missingRef === undefined
      ? 'a reference it uses was not found in this project.'
      : `it references ${formatter.format(entity.missingRef)}, which was not found in this project.`;
  return {
    code: ISSUE_CODE.ENTITY_UNRESOLVED_REFERENCE,
    message: `${displayName} was skipped: ${reason}`,
    severity: IssueSeverity.Error,
    impactedEntity,
  };
}
