/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {IssueSeverity, IssueCategory} from './severity.js';
import type {ImpactedEntity} from './impacted-entity.js';
import type {FixOption} from './fix-option.js';

/**
 * Base issue vocabulary. Carried by Result<T>.issues and mirrored on the wire
 * as ApiIssueItem.
 *
 * Operational failures populate {code, message, severity} at minimum.
 * Domain validation issues (ValidationIssue extends Issue) additionally
 * populate category, impactedEntity, impactedUsecases, and fixOptions.
 *
 * Design §2.5, FR-4.1.
 */
export interface Issue {
  code: string;
  message: string;
  severity: IssueSeverity;
  category?: IssueCategory;
  impactedEntity?: ImpactedEntity;
  impactedUsecases?: number[];
  fixOptions?: FixOption[];
}
