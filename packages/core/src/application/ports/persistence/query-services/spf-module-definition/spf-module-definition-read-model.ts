/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {PortIoType} from '../../../../../domain/entities/common/enums/port-io-type.js';
import type {ParameterDefinitionReadModel} from './parameter-definition/parameter-definition-read-model.js';

export interface DataPortDefinitionReadModel {
  readonly systemId: number;
  readonly dataPortId: number;
  readonly name: string;
}

export interface DataPortGroupReadModel {
  readonly systemId: number;
  readonly portIoType: PortIoType;
  readonly maxAllowedPortCount: number;
  readonly ports: DataPortDefinitionReadModel[] | null;
}

export interface StaticIntentDefinitionReadModel {
  readonly systemId: number;
  readonly intentId: number;
  readonly name: string;
}

export interface ControlPortDefinitionReadModel {
  readonly systemId: number;
  readonly portId: number;
  readonly portName: string;
  readonly staticIntents: StaticIntentDefinitionReadModel[] | null;
}

export interface DynamicIntentDefinitionReadModel {
  readonly systemId: number;
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
export interface SpfModuleDefinitionReadModel {
  readonly systemId: number;
  readonly name: string;
  readonly moduleId: number;

  // includeSummary
  readonly maxInputPortsSupported: number | null;
  readonly maxOutputPortsSupported: number | null;
  readonly maxControlPortsSupported: number | null;

  // includeFullDetails will include the includeSummary
  readonly dataPortGroups: DataPortGroupReadModel[] | null;
  readonly staticControlPorts: ControlPortDefinitionReadModel[] | null;
  readonly dynamicIntents: DynamicIntentDefinitionReadModel[] | null;
  readonly parameterDefinitions: ParameterDefinitionReadModel[] | null;
}
