/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  IssueSeverity,
  VALIDATION_ENTITY_TYPE,
  deriveCategoryFromSeverity,
} from '../../issue.js';
import type {ValidationIssue} from '../../issue.js';
import type {ValidationRule} from '../../validation-rule.js';
import {VALIDATION_RULE_GROUP} from '../../validation-rule.js';
import type {ModuleValidationContext} from '../../validation-context.js';
import {BinaryUtils} from '../../../../shared/utilities/binary-utils.js';

/**
 * ARC-MOD-001 — Missing Module Definition (This is stub created for reference)
 *
 * Checks that every SpfModule in the file references a definition that is
 * present in the loaded ACDB (definitions map). A module with a missing
 * definition cannot be configured or saved — this is a BLOCKING error.
 *
 * Groups: UPLOAD_FILE (run on file open), COMMIT (run before commit)
 */
export class MissingDefinitionRule implements ValidationRule<ModuleValidationContext> {
  readonly code = 'ARC-MOD-001';
  readonly defaultSeverity = IssueSeverity.Error;
  readonly groups = [
    VALIDATION_RULE_GROUP.UploadFile,
    VALIDATION_RULE_GROUP.Commit,
  ];
  readonly requiredEntityTypes = [
    VALIDATION_ENTITY_TYPE.SpfModule,
    VALIDATION_ENTITY_TYPE.SpfModuleDefinition,
  ] as const;

  validate(context: ModuleValidationContext): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    for (const module of context.modules) {
      if (!context.definitions.has(module.definitionSystemId)) {
        const impactedUsecases = (
          context.usecasesByModuleId.get(module.systemId) ?? []
        ).map(uc => uc.systemId);

        issues.push({
          code: this.code,
          name: 'Missing Module Definition',
          description:
            `Module '${module.alias ?? 'unknown'}' ` +
            `(${BinaryUtils.toHexString(module.systemId)}) references ` +
            `definition ${BinaryUtils.toHexString(module.definitionSystemId)} ` +
            `which is not present in the loaded ACDB.`,
          defaultSeverity: this.defaultSeverity,
          effectiveSeverity: this.defaultSeverity,
          category: deriveCategoryFromSeverity(this.defaultSeverity),
          fixOptions: [],
          impactedEntity: {
            entityType: VALIDATION_ENTITY_TYPE.SpfModule,
            systemId: module.systemId,
            displayName: module.alias,
          },
          impactedUsecases,
        });
      }
    }

    return issues;
  }
}
