/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../orchestration/cqrs/queries/query-handler.js';
import type {
  ValidateFileQuery,
  ValidateFileResult,
} from './validate-file.query.js';
import type {QueryServices} from '../../ports/persistence/query-services/query-services.js';
import {Result} from '../../shared/result/result.js';
import {ValidationEngine} from '../validation-engine.js';
import {ValidationContextBuilder} from '../validation-context-builder.js';
import {ValidationOrchestrator} from '../validation-orchestrator.js';
import {MissingDefinitionRule} from '../../../domain/validation/rules/module/missing-definition.rule.js';
import {ZeroCkvMixRule} from '../../../domain/validation/rules/module/zero-ckv-mix.rule.js';
import {VALIDATION_RULE_GROUP} from '../../../domain/validation/validation-rule.js';

/**
 * Handles ValidateFileQuery.
 *
 * Constructs the ValidationEngine, ValidationContextBuilder, and
 * ValidationOrchestrator internally — consistent with how other query
 * handlers use queryServices directly rather than receiving pre-built
 * collaborators via constructor injection.
 */
export class ValidateFileQueryHandler implements QueryHandler<
  ValidateFileQuery,
  Promise<Result<ValidateFileResult>>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(query: ValidateFileQuery): Promise<Result<ValidateFileResult>> {
    const fileId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );
    const group = query.group ?? VALIDATION_RULE_GROUP.SaveFile;

    const engine = new ValidationEngine([
      new MissingDefinitionRule(),
      new ZeroCkvMixRule(),
    ]);
    const contextBuilder = new ValidationContextBuilder(
      this.queryServices.validationQueryService,
    );
    const orchestrator = new ValidationOrchestrator(engine, contextBuilder);
    const report = await orchestrator.validate(fileId, group);
    return Result.ok(
      {
        fileSystemId: String(fileId),
        runAt: new Date().toISOString(),
        group,
        blockedSave: report.blockedSave,
        summary: report.summary,
      },
      report.issues,
    );
  }
}
