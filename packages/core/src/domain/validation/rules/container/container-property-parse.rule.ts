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
import {parseParameterData} from '../../../../application/usecase-designer/shared/parse-elements.js';
import {PARAMETER_ELEMENT_TYPE} from '../../../entities/definitions/common/types/element-type.js';
import {DATA_TYPE} from '../../../../shared/dto/element-data/element-types.js';

/**
 * ARC-CON-002 — Container Property Payload Parse Failure
 *
 * A container property payload must parse according to the
 * `elementsStructure` of its property definition.
 *
 * Groups: SAVE_FILE
 */
export class ContainerPropertyParseRule implements ValidationRule<ContainerValidationContext> {
  readonly code = 'ARC-CON-002';
  readonly defaultSeverity = IssueSeverity.Error;
  readonly groups = [VALIDATION_RULE_GROUP.SaveFile];
  readonly requiredEntityTypes = [
    ENTITY_TYPE.Container,
    ENTITY_TYPE.ContainerPropertyDefinition,
  ] as const;

  validate(context: ContainerValidationContext): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    for (const container of context.containers) {
      for (const [propDefSystemId, propValue] of container.properties) {
        const propDef = context.propDefBySystemId.get(propDefSystemId);
        if (!propDef) continue;

        const payload = propValue.getPayloadCopy();
        if (payload === null) continue;

        const elements = parseParameterData(payload, propDef.elementsStructure);
        // Container property definitions never declare RawData, so RawData here
        // can only be parseParameterData's parse-failure fallback.
        const parseFailed = elements.some(
          el =>
            el.type === PARAMETER_ELEMENT_TYPE.ConfigElement &&
            el.dataType === DATA_TYPE.RawData,
        );
        if (!parseFailed) continue;

        const containerHex = BinaryUtils.toHexString(container.naturalId);
        issues.push({
          code: this.code,
          name: 'Container Property Parse Failure',
          message:
            `Container (${containerHex}) property '${propDef.name}' ` +
            `(${BinaryUtils.toHexString(propDef.naturalId)}) payload fails to parse.`,
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
