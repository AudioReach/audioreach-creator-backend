/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {PropertyPayloadReadModel} from '../../ports/persistence/query-services/shared/property-payload-read-model.js';
import type {PropertyDefinitionWithElements} from './property-definition-with-elements.js';
import type {PropertyDataDto} from './property-read-model.js';
import type {ElementData} from '../../../domain/entities/definitions/common/types/element-data.js';
import {parseParameterData} from './parse-elements.js';
import {Result} from '../../shared/result/result.js';
import type {Issue} from '../../../shared/issues/issue.js';
import {ISSUE_CODE} from '../../../shared/issues/operational-codes.js';
import {IssueSeverity} from '../../../shared/issues/severity.js';

export function buildPropertyModels(
  payloads: PropertyPayloadReadModel[],
  defMap: Map<number, PropertyDefinitionWithElements>,
): Result<PropertyDataDto[]> {
  const payloadMap = new Map(payloads.map(p => [p.propertySystemId, p]));
  const data: PropertyDataDto[] = [];
  const issues: Issue[] = [];
  for (const def of defMap.values()) {
    const p = payloadMap.get(def.systemId);
    if (p === undefined) {
      issues.push({
        code: ISSUE_CODE.PROPERTY_PAYLOAD_NOT_FOUND,
        message: `No payload found for property definition with systemId ${def.systemId} (propertyId ${def.propertyId})`,
        severity: IssueSeverity.Error,
      });
      continue;
    }
    const elements: ElementData[] =
      p.payload !== null
        ? parseParameterData(p.payload, def.elementsStructure)
        : [];
    data.push({
      systemId: p.systemId,
      propertyId: def.propertyId,
      propertyName: def.name,
      elements,
    });
  }
  const result =
    issues.length > 0 ? Result.partial(data, issues) : Result.ok(data);
  return result;
}
