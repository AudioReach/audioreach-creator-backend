/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {type SpecialtyKey} from '../../common/enums/speciality-type.js';
import {
  DuplicateKeyValuePairException,
  NullObjectException,
  SystemIdNotFoundException,
  ValueIdNotFoundException,
} from '../../common/exceptions/input-validation-exception.js';
import {ValueDefinition} from '../entities/value-definition.js';

export interface SpecialityKeyValue {
  key: SpecialtyKey;
  value: string;
}

export interface CLangHeaderAttributes {
  keyEnumName?: string;
  keyEnumValue?: string;
  calibrationEnumValue?: string;
  graphEnumValue?: string;
}

export interface KeyDefinitionInit {
  systemId: number;
  keyId: number;
  fileSystemId: number;
  name: string;
  description?: string;

  isVoice?: boolean;
  isDynamic?: boolean;

  isCalibrationKey?: boolean;
  isGraphKey?: boolean;

  specialityKeyValue?: SpecialityKeyValue;
  cHeaderAttributes?: CLangHeaderAttributes;
}

export class KeyDefinition {
  readonly systemId: number;
  readonly keyId: number;
  readonly fileSystemId: number;
  readonly values: ValueDefinition[] = [];

  name: string;
  description?: string;

  isVoice?: boolean;
  isDynamic?: boolean;

  isCalibrationKey?: boolean;
  isGraphKey?: boolean;

  specialityKeyValue?: SpecialityKeyValue;
  cHeaderAttributes?: CLangHeaderAttributes;

  constructor(initParam: KeyDefinitionInit) {
    this.systemId = initParam.systemId;
    this.keyId = initParam.keyId;
    this.fileSystemId = initParam.fileSystemId;
    this.name = initParam.name;
    this.description = initParam.description ?? '';
    this.isCalibrationKey = initParam.isCalibrationKey ?? false;
    this.isGraphKey = initParam.isGraphKey ?? false;
    this.isVoice = initParam.isVoice ?? false;
    this.isDynamic = initParam.isDynamic ?? false;
    this.checkInvariants();
  }

  checkInvariants() {
    if (!this.isGraphKey && !this.isCalibrationKey)
      throw new Error(
        `Key :${this.keyId} has to be either a graph or calibration`,
      );
  }

  AddValue(valueDefinition: ValueDefinition): void {
    if (!valueDefinition) {
      throw new NullObjectException('Value is null');
    }

    if (valueDefinition.systemId == undefined) {
      throw new SystemIdNotFoundException();
    }

    if (!valueDefinition.valueId) {
      throw new ValueIdNotFoundException();
    }

    const valueWithSameValueId = this.values.some(
      v => v.valueId === valueDefinition.valueId,
    );
    if (valueWithSameValueId) {
      throw new DuplicateKeyValuePairException(
        `ValueId ${valueDefinition.valueId} already exists in ValueDefinition for key: ${this.keyId}`,
      );
    }

    // If validation passes, add the value
    this.values.push(valueDefinition);
  }
}
