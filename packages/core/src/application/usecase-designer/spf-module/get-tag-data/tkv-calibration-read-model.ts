/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
export type {ParameterCalibrationReadModel} from '../get-cal-data/ckv-calibration-read-model.js';
import type {TkvReadModel} from '../../../ports/persistence/query-services/spf-module/tuning/tuning-config-read-model.js';
import type {ParameterCalibrationReadModel} from '../get-cal-data/ckv-calibration-read-model.js';

export interface TkvCalibrationReadModel {
  tkv: TkvReadModel;
  parameters: ParameterCalibrationReadModel[];
}
