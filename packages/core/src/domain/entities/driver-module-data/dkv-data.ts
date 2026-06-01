/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ModuleParameterData} from '../common/value-objects/module-parameter-data.js';
import {DuplicateParameterPayloadError} from '../common/entities/kv-data.js';

export interface DkvDataInit {
  systemId: number;
  valueDefinitionSystemIds: readonly number[];
}

/**
 * Represents DKV (Driver Key-Value) calibration data for a driver module.
 * Similar to CKV (Calibration Key-Value) for SPF modules, but for driver modules.
 * This can only be used for add. Update is handled by ModuleParameterPayload.
 */
export class DkvData {
  /** Fast lookup by parameterId */
  private readonly byId = new Map<number, ModuleParameterData>();

  readonly parameterPayloads: ModuleParameterData[] = [];
  systemId: number; // Mutable to allow assignment during system ID resolution phase
  readonly valueDefinitionSystemIds: readonly number[];

  constructor(init: DkvDataInit) {
    this.systemId = init.systemId;
    this.valueDefinitionSystemIds = init.valueDefinitionSystemIds;
  }

  hasParameter(id: number): boolean {
    return this.byId.has(id);
  }

  /**
   * Adds a payload. Throws DuplicateParameterPayloadError if the id already exists.
   */
  addParameterPayload(parameterData: ModuleParameterData): void {
    const id = parameterData.paramDefintionSystemId;
    if (this.byId.has(id)) {
      throw new DuplicateParameterPayloadError(id);
    }
    this.parameterPayloads.push(parameterData);
    this.byId.set(id, parameterData);
  }
}
