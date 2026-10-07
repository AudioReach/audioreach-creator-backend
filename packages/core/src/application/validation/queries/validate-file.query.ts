/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseQuery} from '../../shared/base-query.js';
import {parseId} from '../../usecase-designer/shared/parse-id.js';
import type {ValidationRuleGroup} from '../../../domain/validation/validation-rule.js';
import type {ValidationSummary} from '../../../domain/validation/validation-report.js';

/**
 * Query to run validation for a project's file.
 *
 * `projectId` is accepted as the raw string from the HTTP layer and parsed in
 * the constructor (decimal or 0x hex). Throws `InvalidOperationException`
 * (mapped to HTTP 400) if it cannot be parsed. `group` is optional; the
 * handler applies `SAVE_FILE` when it is omitted.
 */
export class ValidateFileQuery extends BaseQuery {
  public readonly projectId: number;

  constructor(
    projectIdStr: string,
    public readonly group: ValidationRuleGroup | undefined,
    clientId: string,
  ) {
    super(clientId);
    this.projectId = parseId(projectIdStr, 'projectId');
  }
}

export interface ValidateFileResult {
  /** System id of the validated file, as a string like every wire system id. */
  fileSystemId: string;
  /** ISO 8601 timestamp of when the validation ran. */
  runAt: string;
  /** Effective group after the default has been applied. */
  group: ValidationRuleGroup;
  blockedSave: boolean;
  summary: ValidationSummary;
}
