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
  enumMember?: string;
  enumName?: string;
  calKeyEnumMember?: string;
  graphKeyEnumMember?: string;
}

export interface KeyDefinitionInit {
  systemId: number;
  naturalId: number;
  fileSystemId: number;
  name: string;
  description?: string;

  isVoice?: boolean;
  isDynamic?: boolean;

  isCalibrationKey?: boolean;
  isGraphKey?: boolean;
  isSpfKey?: boolean;

  specialityKeyValue?: SpecialityKeyValue;
  cHeaderAttributes?: CHeaderAttributes;
  values?: ValueDefinition[];
}

export class KeyDefinition {
  systemId: number;
  readonly naturalId: number;
  fileSystemId: number;
  readonly values: ValueDefinition[] = [];

  name: string;
  description?: string;

  isVoice?: boolean;
  isDynamic?: boolean;

  isCalibrationKey?: boolean;
  isGraphKey?: boolean;
  isSpfKey?: boolean;

  specialityKeyValue?: SpecialityKeyValue;
  cHeaderAttributes?: CHeaderAttributes;

  private readonly valueIds = new Set<number>();

  constructor(initParam: KeyDefinitionInit) {
    this.systemId = initParam.systemId;
    this.naturalId = initParam.naturalId;
    this.fileSystemId = initParam.fileSystemId;
    this.name = initParam.name;
    this.description = initParam.description ?? '';
    this.isCalibrationKey = initParam.isCalibrationKey ?? false;
    this.isGraphKey = initParam.isGraphKey ?? false;
    this.isSpfKey = initParam.isSpfKey;
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
      `Key :${BinaryUtils.toHexString(this.naturalId)} has to be either a graph or calibration`,
    );
  }

  private AddValue(valueDefinition: ValueDefinition): void {
    assertNonNull(
      valueDefinition,
      `valueDefinition is null for key definition:${BinaryUtils.toHexString(this.naturalId)}`,
    );
    assertNonNull(
      valueDefinition.systemId,
      `systemId is required for value in key ${BinaryUtils.toHexString(this.naturalId)}`,
    );
    assertNonNull(
      valueDefinition.naturalId,
      `valueId is required for value in key ${BinaryUtils.toHexString(this.naturalId)}`,
    );

    invariant(
      !this.valueIds.has(valueDefinition.naturalId),
      `ValueId ${BinaryUtils.toHexString(valueDefinition.naturalId)} already exists in ValueDefinition for key: ${BinaryUtils.toHexString(this.naturalId)}`,
    );

    this.valueIds.add(valueDefinition.naturalId);
    this.values.push(valueDefinition);
  }
}
