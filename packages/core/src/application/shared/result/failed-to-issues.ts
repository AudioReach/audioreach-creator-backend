/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  BatchRead,
  FailedEntity,
} from '../../ports/persistence/batch-read.js';
import {FAILED_ENTITY_REASON} from '../../ports/persistence/batch-read.js';
import type {EntityRef} from '../../../domain/identity/entity-identity.js';
import {EntityIssueFactory} from '../../../domain/issues/entity-issue-factory.js';
import type {IssueFact} from '../../../domain/issues/issue-fact.js';
import type {Issue} from '../../issues/issue.js';
import {IssueRenderer} from '../../issues/issue-renderer.js';
import type {EntityType} from '../../../shared/entity-type.js';
import type {ISSUE_CODE} from '../../../shared/issues/operational-codes.js';

type FailedEntityCode =
  | typeof ISSUE_CODE.ENTITY_NOT_FOUND
  | typeof ISSUE_CODE.ENTITY_UNRESOLVED_REFERENCE;

/**
 * Turns the `failed` list of a `BatchRead` into issues, so a query
 * handler can return `Result.partial(items, issues)`. To report only some
 * failures, pass `{...batch, failed: subset}`.
 *
 * The read already returned every identity it knows, so the issues are
 * rendered without another read: text shows the entity's natural identity
 * when the read supplied it, otherwise the `systemId` fallback.
 */
export function failedToIssues<E extends EntityType>(
  batch: BatchRead<unknown, E>,
): Issue<FailedEntityCode>[] {
  return IssueRenderer.renderWithoutReads(
    batch.failed.map(entity => failedEntityToFact(batch.entityType, entity)),
  );
}

function failedEntityToFact<E extends EntityType>(
  entityType: E,
  entity: FailedEntity<E>,
): IssueFact<FailedEntityCode> {
  const ref = {
    entityType,
    systemId: entity.systemId,
    ...(entity.identity && {identity: entity.identity}),
  } as EntityRef;

  return entity.reason === FAILED_ENTITY_REASON.NotFound
    ? EntityIssueFactory.notFound(ref)
    : EntityIssueFactory.unresolvedReference(ref, entity.missingRef);
}
