/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  IssueSeverity,
  deriveCategoryFromSeverity,
} from '../../../../shared/issues/index.js';
import {ENTITY_TYPE} from '../../../../shared/entity-type.js';
import type {ValidationIssue} from '../../issue.js';
import type {ValidationRule} from '../../validation-rule.js';
import {VALIDATION_RULE_GROUP} from '../../validation-rule.js';
import type {ContainerValidationContext} from '../../validation-context.js';
import {BinaryUtils} from '../../../../shared/utilities/binary-utils.js';

/**
 * ARC-CON-001 — Missing Required Container Property
 *
 * Every container property definition in the file is required for every
 * container, so a container with no property data row for a definition is
 * reported. A row with a null payload counts as present; whether a payload
 * parses is ARC-CON-002's concern.
 *
 * Groups: SAVE_FILE
 *
 * fixOptions and impactedUsecases are empty: the fix and the use case
 * lookup depend on functions that do not exist yet (design §8.1).
 */
export class MissingContainerPropertyRule implements ValidationRule<ContainerValidationContext> {
  readonly code = 'ARC-CON-001';
  readonly defaultSeverity = IssueSeverity.Error;
  readonly groups = [VALIDATION_RULE_GROUP.SaveFile];
  readonly requiredEntityTypes = [
    ENTITY_TYPE.Container,
    ENTITY_TYPE.ContainerPropertyDefinition,
  ] as const;

  validate(context: ContainerValidationContext): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    for (const container of context.containers) {
      for (const propDef of context.propDefBySystemId.values()) {
        if (container.properties.has(propDef.systemId)) continue;

        const containerHex = BinaryUtils.toHexString(container.naturalId);
        issues.push({
          code: this.code,
          name: 'Missing Container Property',
          message:
            `Container (${containerHex}) is missing required property ` +
            `'${propDef.name}' (${BinaryUtils.toHexString(propDef.naturalId)}).`,
          defaultSeverity: this.defaultSeverity,
          severity: this.defaultSeverity,
          category: deriveCategoryFromSeverity(this.defaultSeverity),
          impactedEntity: {
            entityType: ENTITY_TYPE.Container,
            systemId: container.systemId,
            displayName: containerHex,
          },
          impactedUsecases: [],
          fixOptions: [],
        });
      }
    }

    return issues;
  }
}
