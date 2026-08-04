/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {PropertyPayloadReadModel} from '../../ports/persistence/query-services/shared/property-payload-read-model.js';
import type {PropertyDefinitionWithElements} from './property-definition-with-elements.js';
import type {PropertyReadModel} from '../container/get-properties/property-read-model.js';
import type {ElementData} from '../../../domain/entities/definitions/common/types/element-data.js';
import {parseParameterData} from '../spf-module/param-parser/parse-elements.js';

export function buildPropertyModels(
  payloads: PropertyPayloadReadModel[],
  defMap: Map<number, PropertyDefinitionWithElements>,
): PropertyReadModel[] {
  return payloads.map(p => {
    const def = defMap.get(p.propertySystemId);
    const hasDefinition = def !== undefined;
    const elements: ElementData[] =
      p.payload !== null && def !== undefined
        ? parseParameterData(p.payload, def.elementsStructure)
        : [];
    return {
      systemId: p.systemId,
      propertyId: def?.propertyId ?? 0,
      propertyName: def?.name ?? '',
      hasDefinition,
      elements,
    };
  });
}
