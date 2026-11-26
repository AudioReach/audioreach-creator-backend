/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ISSUE_CODE} from '../../shared/issues/operational-codes.js';
import {IssueSeverity} from '../../shared/issues/severity.js';
import type {EntityRef} from '../identity/entity-identity.js';
import type {IssueFact} from './issue-fact.js';

/** Creates the issue facts about a missing entity that any area can report. */
export const EntityIssueFactory = {
  /** `entity` does not exist in the file. */
  notFound(entity: EntityRef): IssueFact<typeof ISSUE_CODE.ENTITY_NOT_FOUND> {
    return {
      code: ISSUE_CODE.ENTITY_NOT_FOUND,
      severity: IssueSeverity.Error,
      impactedEntity: entity,
    };
  },

  /**
   * `entity` was skipped because it references an entity that does not
   * exist: `missingEntity`, when it is known.
   */
  unresolvedReference(
    entity: EntityRef,
    missingEntity?: EntityRef,
  ): IssueFact<typeof ISSUE_CODE.ENTITY_UNRESOLVED_REFERENCE> {
    return {
      code: ISSUE_CODE.ENTITY_UNRESOLVED_REFERENCE,
      severity: IssueSeverity.Error,
      impactedEntity: entity,
      relatedEntities: missingEntity === undefined ? {} : {missingEntity},
    };
  },
};
