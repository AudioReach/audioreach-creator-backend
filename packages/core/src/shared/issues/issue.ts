/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {IssueSeverity, IssueCategory} from './severity.js';
import type {LegacyImpactedEntity} from './impacted-entity.js';
import type {LegacyFixOption} from './fix-option.js';

/**
 * Base issue vocabulary. Carried by Result<T>.issues and mirrored on the wire
 * as ApiIssueItem.
 *
 * Legacy: the producer writes `message` itself. Producers move to issue facts
 * that a renderer turns into text; this type is removed once all have moved
 * (logging design §8.3, §13.1).
 *
 * Operational failures populate {code, message, severity} at minimum.
 * Domain validation issues (ValidationIssue extends LegacyIssue) additionally
 * populate category, impactedEntity, impactedUsecases, and fixOptions.
 *
 * Design §2.5, FR-4.1.
 */
export interface LegacyIssue {
  code: string;
  message: string;
  severity: IssueSeverity;
  category?: IssueCategory;
  impactedEntity?: LegacyImpactedEntity;
  impactedUsecases?: number[];
  fixOptions?: LegacyFixOption[];
}
