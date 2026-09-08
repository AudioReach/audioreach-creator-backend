/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ParameterPayloadReadModel} from '../../ports/persistence/query-services/spf-module/ckv/ckv-read-model.js';
import type {ParameterDefinitionReadModel} from '../../ports/persistence/query-services/shared/parameter-definition-read-model.js';
import type {ParameterCalibrationReadModel} from '../spf-module/get-cal-data/ckv-calibration-read-model.js';
import type {ElementData} from '../../../domain/entities/definitions/common/types/element-data.js';
import type {ParamType} from '../../../domain/entities/definitions/common/types/param-type.js';
import {parseParameterData} from './parse-elements.js';
import {
  NullPayloadError,
  ParameterDefinitionMissingError,
} from '../../../shared/errors/parameter.errors.js';
import type {Logger} from '../../../shared/types/logger.interface.js';

export function buildParameterModels(
  payloads: ParameterPayloadReadModel[],
  definitions: ParameterDefinitionReadModel[],
  logger?: Logger,
): ParameterCalibrationReadModel[] {
  const defMap = new Map(definitions.map(d => [d.systemId, d]));
  return payloads.map(p => {
    if (p.payload === null) throw new NullPayloadError(p.parameterSystemId);
    const def = defMap.get(p.parameterSystemId);
    if (def === undefined)
      throw new ParameterDefinitionMissingError(p.parameterSystemId);
    const parsedData: ElementData[] = parseParameterData(
      p.payload,
      def.elementsStructure ?? '',
      logger,
    );
    return {
      systemId: p.systemId,
      naturalId: def.naturalId,
      name: def.name ?? String(def.naturalId),
      description: def.description,
      isReadOnly: def.isReadOnly ?? false,
      isHidden: undefined,
      pidType: def.pidType as ParamType,
      parsedData,
    };
  });
}
