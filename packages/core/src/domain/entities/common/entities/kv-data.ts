/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ModuleParameterData} from '../value-objects/module-parameter-data.js';

export class DuplicateParameterPayloadError extends Error {
  constructor(readonly parameterId: number) {
    super(`Parameter payload with id ${parameterId} already exists`);
    this.name = 'DuplicateParameterPayloadError';
  }
}

export interface KvDataInit {
  systemId: number;
  valueDefinitionSystemIds: readonly number[];
  uiPersistence: Uint8Array | null;
}

/**
 * This can only be used for add. update is handled by ModuleParameterPayload and specific api for uiPersistence
 */
export class KvData {
  /** Fast lookup by parameterId */
  private readonly byId = new Map<number, ModuleParameterData>();

  readonly parameterPayloads: ModuleParameterData[] = [];
  systemId: number; // Mutable to allow assignment during system ID resolution phase
  readonly valueDefinitionSystemIds: readonly number[];
  uiPersistence: Uint8Array | null;

  constructor(init: KvDataInit) {
    this.systemId = init.systemId;
    this.valueDefinitionSystemIds = init.valueDefinitionSystemIds;
    this.uiPersistence = init.uiPersistence;
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
