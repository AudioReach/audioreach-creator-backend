/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {PropertyPayloadReadModel} from '../../ports/persistence/query-services/shared/property-payload-read-model.js';
import type {PropertyDefinitionWithElements} from './property-definition-with-elements.js';
import type {PropertyDataDto} from './property-read-model.js';
import type {ElementData} from '../../../domain/entities/definitions/common/types/element-data.js';
import {parseParameterData} from './parse-elements.js';
import {ResourceNotFoundException} from '../../../shared/exceptions/resource-not-found.exception.js';

export function buildPropertyModels(
  payloads: PropertyPayloadReadModel[],
  defMap: Map<number, PropertyDefinitionWithElements>,
): PropertyDataDto[] {
  const payloadMap = new Map(payloads.map(p => [p.propertySystemId, p]));
  const result: PropertyDataDto[] = [];
  for (const def of defMap.values()) {
    const p = payloadMap.get(def.systemId);
    if (p === undefined) {
      throw new ResourceNotFoundException(
        `No payload found for property definition with systemId ${def.systemId} (propertyId ${def.propertyId})`,
      );
    }
    const elements: ElementData[] =
      p.payload !== null
        ? parseParameterData(p.payload, def.elementsStructure)
        : [];
    result.push({
      systemId: p.systemId,
      propertyId: def.propertyId,
      propertyName: def.name,
      elements,
    });
  }
  return result;
}
