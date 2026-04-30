/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../orchestration/cqrs/queries/query-handler.js';
import type {
  ValidateFileQuery,
  ValidateFileResult,
} from './validate-file.query.js';
import type {QueryServices} from '../../services/query-services.js';
import {ValidationEngine} from '../validation-engine.js';
import {ValidationContextBuilder} from '../validation-context-builder.js';
import {ValidationOrchestrator} from '../validation-orchestrator.js';
import {MissingDefinitionRule} from '../../../domain/validation/rules/module/missing-definition.rule.js';

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
  Promise<ValidateFileResult>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(query: ValidateFileQuery): Promise<ValidateFileResult> {
    const engine = new ValidationEngine([new MissingDefinitionRule()]);
    const contextBuilder = new ValidationContextBuilder(
      this.queryServices.validationQueryService,
    );
    const orchestrator = new ValidationOrchestrator(engine, contextBuilder);
    const report = await orchestrator.validate(query.fileSystemId, query.group);
    return {report};
  }
}
