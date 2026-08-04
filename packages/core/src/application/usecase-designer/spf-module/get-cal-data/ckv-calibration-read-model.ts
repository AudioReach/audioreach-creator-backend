/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {CkvReadModel} from '../../../ports/persistence/query-services/spf-module/tuning/tuning-config-read-model.js';
import type {ElementData} from '../../../../domain/entities/definitions/common/types/element-data.js';
import type {ParamType} from '../../../../domain/entities/definitions/common/types/param-type.js';

export interface ParameterCalibrationReadModel {
  readonly systemId: number;
  parameterId: number;
  name: string;
  description?: string;
  isReadOnly: boolean;
  isHidden?: boolean;
  pidType: ParamType;
  parsedData: ElementData[] | null;
}

export interface CkvCalibrationReadModel {
  ckv: CkvReadModel;
  parameters: ParameterCalibrationReadModel[];
  /**
   * Parameter system IDs that were explicitly requested (via `paramSystemIds`)
   * but had no matching payload row in the database.
   * Undefined when no filter was applied (all parameters returned).
   */
  missingParamSystemIds?: number[];
}
