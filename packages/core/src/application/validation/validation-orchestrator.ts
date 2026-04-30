/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ValidationRuleGroup} from '../../domain/validation/validation-rule.js';
import type {ValidationReport} from '../../domain/validation/validation-report.js';
import {ValidationReport as ValidationReportClass} from '../../domain/validation/validation-report.js';
import type {ValidationEngine} from './validation-engine.js';
import type {ValidationContextBuilder} from './validation-context-builder.js';

/**
 * Orchestrates a full validation run for a given file and rule group.
 *
 * Steps:
 *   1. Compute required entity types from the active rule group
 *   2. Build the FileValidationContext (loading only needed DB tables)
 *   3. Run the engine and collect domain validation issues
 *   4. Load stored DATA_LOSS issues from files.data_loss_issues
 *   5. Merge both sets into a single ValidationReport
 *
 * Using this class avoids duplicating the same orchestration logic in every
 * handler that needs to run validation (ValidateFileQuery, pre-commit, pre-save, etc.).
 */
export class ValidationOrchestrator {
  constructor(
    private readonly engine: ValidationEngine,
    private readonly contextBuilder: ValidationContextBuilder,
  ) {}

  async validate(
    fileSystemId: number,
    group: ValidationRuleGroup,
  ): Promise<ValidationReport> {
    const requiredEntityTypes = this.engine.getRequiredEntityTypes(group);
    const context = await this.contextBuilder.fromDb(
      fileSystemId,
      requiredEntityTypes,
    );
    const engineReport = this.engine.run(context, group);

    // Merge stored DATA_LOSS issues from the upload phase
    const storedDataLossIssues =
      await this.contextBuilder.queryRepo.findStoredDataLossIssues(
        fileSystemId,
      );

    if (storedDataLossIssues.length === 0) return engineReport;

    return new ValidationReportClass([
      ...engineReport.issues,
      ...storedDataLossIssues,
    ]);
  }
}
