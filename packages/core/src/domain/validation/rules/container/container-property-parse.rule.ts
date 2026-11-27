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
 * Tells whether a payload parses against an `elementsStructure`. Supplied by
 * the application layer, because the parser lives there and domain code must
 * not import it.
 */
export type PayloadParses = (
  payload: Uint8Array,
  elementsStructure: string,
) => boolean;

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

  constructor(private readonly payloadParses: PayloadParses) {}

  validate(context: ContainerValidationContext): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    for (const container of context.containers) {
      for (const [propDefSystemId, propValue] of container.properties) {
        const propDef = context.propDefBySystemId.get(propDefSystemId);
        if (!propDef) continue;

        const payload = propValue.getPayloadCopy();
        if (payload === null) continue;

        if (this.payloadParses(payload, propDef.elementsStructure)) continue;

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
