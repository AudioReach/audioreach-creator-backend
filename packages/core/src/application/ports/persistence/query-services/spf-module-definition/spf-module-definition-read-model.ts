/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ReadModelBase} from '../../../../shared/read-model-base.js';
import type {PortIoType} from '../../../../../domain/entities/common/enums/port-io-type.js';
import type {ParameterDefinitionReadModel} from './parameter-definition/parameter-definition-read-model.js';

export interface DataPortDefinitionReadModel extends ReadModelBase {
  readonly dataPortId: number;
  readonly name: string;
}

export interface DataPortGroupReadModel extends ReadModelBase {
  readonly portIoType: PortIoType;
  readonly maxAllowedPortCount: number;
  readonly ports: DataPortDefinitionReadModel[] | null;
}

export interface StaticIntentDefinitionReadModel extends ReadModelBase {
  readonly intentId: number;
  readonly name: string;
}

export interface StaticControlPortDefinitionReadModel extends ReadModelBase {
  readonly portId: number;
  readonly portName: string;
  readonly staticIntents: StaticIntentDefinitionReadModel[] | null;
}

export interface DynamicIntentDefinitionReadModel extends ReadModelBase {
  readonly intentId: number;
  readonly name: string;
  readonly maxPort: number;
}

/**
 * Read model for the SpfModuleDefinition aggregate.
 *
 * Identity fields (name, moduleId) are always populated.
 *
 * includeSummary — port capacity counts (null when not requested):
 *   maxInputPortsSupported, maxOutputPortsSupported, maxControlPortsSupported
 *
 * includeFullDetails — structural definition records (null when not requested):
 *   dataPortGroups (with ports), staticControlPorts (with intents),
 *   dynamicIntents, parameterDefinitions
 *
 * null  = not requested
 * value = loaded (0 / [] are valid populated values)
 */
export interface SpfModuleDefinitionReadModel extends ReadModelBase {
  readonly name: string;
  readonly moduleId: number;

  // includeSummary
  readonly maxInputPortsSupported: number | null;
  readonly maxOutputPortsSupported: number | null;
  readonly maxControlPortsSupported: number | null;

  // includeFullDetails
  readonly dataPortGroups: DataPortGroupReadModel[] | null;
  readonly staticControlPorts: StaticControlPortDefinitionReadModel[] | null;
  readonly dynamicIntents: DynamicIntentDefinitionReadModel[] | null;
  readonly parameterDefinitions: ParameterDefinitionReadModel[] | null;
}
