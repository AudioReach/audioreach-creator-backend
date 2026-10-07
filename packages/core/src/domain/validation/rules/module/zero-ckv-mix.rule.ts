/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  IssueSeverity,
  ISSUE_ENTITY_TYPE,
  deriveCategoryFromSeverity,
} from '../../../../shared/issues/index.js';
import type {ValidationIssue} from '../../issue.js';
import type {ValidationRule} from '../../validation-rule.js';
import {VALIDATION_RULE_GROUP} from '../../validation-rule.js';
import type {ModuleValidationContext} from '../../validation-context.js';
import {BinaryUtils} from '../../../../shared/utilities/binary-utils.js';

/**
 * ARC-MOD-005 — Zero-Key CKV Mixed With Non-Zero CKV Entries
 *
 * A module instance must not have a zero-key CKV entry when it also has one
 * or more non-zero CKV entries. A zero-key CKV entry
 * (valueDefinitionSystemIds.length === 0) is only valid when it is the sole
 * CKV entry for that module instance.
 *
 * Groups: SAVE_FILE
 */
export class ZeroCkvMixRule implements ValidationRule<ModuleValidationContext> {
  readonly code = 'ARC-MOD-005';
  readonly defaultSeverity = IssueSeverity.Error;
  readonly groups = [VALIDATION_RULE_GROUP.SaveFile];
  readonly requiredEntityTypes = [ISSUE_ENTITY_TYPE.SpfModule] as const;

  validate(context: ModuleValidationContext): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    for (const module of context.modules) {
      const hasZero = module.ckvs.some(
        ckv => ckv.valueDefinitionSystemIds.length === 0,
      );
      const hasNonZero = module.ckvs.some(
        ckv => ckv.valueDefinitionSystemIds.length > 0,
      );

      if (!hasZero || !hasNonZero) {
        continue;
      }

      const zeroCkv = module.ckvs.find(
        ckv => ckv.valueDefinitionSystemIds.length === 0,
      )!;
      const nonZeroCount = module.ckvs.filter(
        ckv => ckv.valueDefinitionSystemIds.length > 0,
      ).length;
      const alias = module.alias || BinaryUtils.toHexString(module.naturalId);

      issues.push({
        code: this.code,
        name: 'Zero-Key CKV Mixed With Non-Zero CKV',
        message:
          `Module '${alias}' (${BinaryUtils.toHexString(module.systemId)}) has a zero-key CKV entry ` +
          `alongside ${nonZeroCount} non-zero CKV entries.`,
        defaultSeverity: this.defaultSeverity,
        severity: this.defaultSeverity,
        category: deriveCategoryFromSeverity(this.defaultSeverity),
        impactedEntity: {
          entityType: ISSUE_ENTITY_TYPE.SpfModule,
          systemId: module.systemId,
          displayName: alias,
        },
        impactedUsecases: [],
        fixOptions: [
          {
            systemId: 'remove-zero-ckv',
            description:
              'Remove the zero-key CKV entry from the module instance',
            // TODO: RemoveCkvCommand does not exist yet — implement when DELETE /ckvs endpoint is built (spf-module.controller.ts removeCkvs stub).
            commandType: 'RemoveCkvCommand',
            commandPayload: {
              moduleSystemId: module.systemId,
              ckvSystemId: zeroCkv.systemId,
            },
            requiredClientInputs: [],
          },
        ],
      });
    }

    return issues;
  }
}
