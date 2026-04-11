/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {type SpecialtyKey} from '../common/types/speciality-type.js';
import {ValueDefinition} from './entities/value-definition.js';
import {assertNonNull, invariant} from '../../../../shared/assertions/index.js';
import {BinaryUtils} from '../../../../shared/utilities/binary-utils.js';

export interface SpecialityKeyValue {
  key: SpecialtyKey;
  value: string;
}

export interface CHeaderAttributes {
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
  cHeaderAttributes?: CHeaderAttributes;
  values?: ValueDefinition[];
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
  cHeaderAttributes?: CHeaderAttributes;

  private readonly valueIds = new Set<number>();

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
    this.specialityKeyValue = initParam.specialityKeyValue;
    this.cHeaderAttributes = initParam.cHeaderAttributes;
    for (const value of initParam.values ?? []) {
      this.AddValue(value);
    }
    this.checkInvariants();
  }

  checkInvariants() {
    invariant(
      this.isGraphKey || this.isCalibrationKey,
      `Key :${BinaryUtils.toHexString(this.keyId)} has to be either a graph or calibration`,
    );
  }

  private AddValue(valueDefinition: ValueDefinition): void {
    assertNonNull(
      valueDefinition,
      `valueDefinition is null for key definition:${BinaryUtils.toHexString(this.keyId)}`,
    );
    assertNonNull(
      valueDefinition.systemId,
      `systemId is required for value in key ${BinaryUtils.toHexString(this.keyId)}`,
    );
    assertNonNull(
      valueDefinition.valueId,
      `valueId is required for value in key ${BinaryUtils.toHexString(this.keyId)}`,
    );

    invariant(
      !this.valueIds.has(valueDefinition.valueId),
      `ValueId ${BinaryUtils.toHexString(valueDefinition.valueId)} already exists in ValueDefinition for key: ${BinaryUtils.toHexString(this.keyId)}`,
    );

    this.valueIds.add(valueDefinition.valueId);
    this.values.push(valueDefinition);
  }
}
