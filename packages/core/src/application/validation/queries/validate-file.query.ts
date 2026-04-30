/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseQuery} from '../../shared/base-query.js';
import type {ValidationRuleGroup} from '../../../domain/validation/validation-rule.js';
import type {ValidationReport} from '../../../domain/validation/validation-report.js';

export class ValidateFileQuery extends BaseQuery {
  constructor(
    public readonly fileSystemId: number,
    public readonly group: ValidationRuleGroup,
    clientId: string,
  ) {
    super(clientId);
  }
}

export interface ValidateFileResult {
  report: ValidationReport;
}
