/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {ReadModelBase} from '../../../../../shared/read-model-base.js';

export interface CkvReadModel extends ReadModelBase {
  spfModuleSystemId: number;
  uiPersistence: Uint8Array | null;
  keyValuePairs: CkvKeyValuePairReadModel[];
}

export interface ParameterPayloadReadModel extends ReadModelBase {
  parameterSystemId: number; // FK to SpfModuleParameterDefinition.systemId
  payload: Uint8Array | null;
}

export interface CkvKeyReadModel extends ReadModelBase {
  keyId: number;
  name: string;
}

export interface CkvValueReadModel extends ReadModelBase {
  valueId: number;
  name: string;
}

export interface CkvKeyValuePairReadModel {
  key: CkvKeyReadModel;
  value: CkvValueReadModel;
}
