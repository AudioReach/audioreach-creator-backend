/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {VocoderModuleType} from '../type/vocoder-module-type.js';
import type {ModuleDirectionType} from '../type/module-direction-type.js';
import type {MdfModuleType} from '../type/mdf-module-type.js';
import type {MajorModuleType} from '../type/major-module-type.js';
import type {BuildType} from '../type/build-type.js';
import {AwspDataPortsInfo} from './data-ports-info.js';
import {AwspControlPortsInfo} from './control-ports-info.js';
import {AwspCustomModuleInfo} from './custom-module-info.js';
import {BaseModuleDefinition} from '../common/base-module-definition.js';
import {AwspSpfModuleDefinitionSchema} from './spf-module-definition.schema.js';
import {AwspParamDefinition} from '../common/param-definition.js';

/**
 * Represents an SPF module definition with comprehensive module information.
 * Extends BaseModuleDefinition with SPF-specific properties.
 */
export class AwspSpfModuleDefinition extends BaseModuleDefinition {
  /** List of supported processor IDs (required) */
  supportedProcessorIds!: number[];

  /** Dictionary of supported container types (required) */
  supportedContainerTypes!: number[];

  /** Input port information (optional) */
  inputPortsInfo?: AwspDataPortsInfo;

  /** Output ports information (optional) */
  outputPortsInfo?: AwspDataPortsInfo;

  /** Control ports information (optional) */
  controlPortsInfo?: AwspControlPortsInfo;

  /** Stack size (optional) */
  stackSize?: number;

  /** Vocoder module type (optional) */
  vocoderModuleType?: VocoderModuleType;

  /** Direction type (optional) */
  directionType?: ModuleDirectionType;

  /** MDF module type (optional) */
  mdfModuleType?: MdfModuleType;

  /** Search keys (optional) */
  searchKeys?: string;

  /** Indicates if module is offloadable (optional) */
  isOffloadable?: boolean;

  /** Indicates if module is built-in (optional) */
  builtIn?: boolean;

  /** Major module type (optional) */
  majorModuleType?: MajorModuleType;

  /** Build type (optional) */
  buildType?: BuildType;

  /** Indicates if module is island friendly (optional) */
  islandFriendly?: boolean;

  /** Custom module information (optional) */
  customModuleInfo?: AwspCustomModuleInfo;

  /** Group name (optional) */
  groupName?: string;

  /** RTM log code (optional) */
  rtmLogCode?: string;

  /** Indicates if module has neural network parameters (optional) */
  hasNeuralNetParam?: boolean;

  /**
   * Parse JSON data into AwspSpfModuleDefinition instance
   * @param data - Raw JSON data
   * @returns Validated AwspSpfModuleDefinition instance
   * @throws ZodError if validation fails
   */
  static fromJSON(data: unknown): AwspSpfModuleDefinition {
    const validated = AwspSpfModuleDefinitionSchema.parse(data);

    return this.hydrateInstance(new AwspSpfModuleDefinition(), validated, [
      {
        field: 'paramDefinitions',
        hydrator: AwspParamDefinition,
        isArray: true,
      },
      {
        field: 'inputPortsInfo',
        hydrator: AwspDataPortsInfo,
      },
      {
        field: 'outputPortsInfo',
        hydrator: AwspDataPortsInfo,
      },
      {
        field: 'controlPortsInfo',
        hydrator: AwspControlPortsInfo,
      },
      {
        field: 'customModuleInfo',
        hydrator: AwspCustomModuleInfo,
      },
    ]);
  }

  /**
   * Serialize AwspSpfModuleDefinition to JSON
   * @returns Plain object suitable for JSON serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      ...this.serializeBaseModuleFields(),
      supportedProcessorIds: this.supportedProcessorIds,
      supportedContainerTypes: this.supportedContainerTypes,
      inputPortsInfo: this.serializeField(this.inputPortsInfo),
      outputPortsInfo: this.serializeField(this.outputPortsInfo),
      controlPortsInfo: this.serializeField(this.controlPortsInfo),
      stackSize: this.stackSize,
      vocoderModuleType: this.vocoderModuleType,
      directionType: this.directionType,
      mdfModuleType: this.mdfModuleType,
      searchKeys: this.searchKeys,
      isOffloadable: this.isOffloadable,
      builtIn: this.builtIn,
      majorModuleType: this.majorModuleType,
      buildType: this.buildType,
      islandFriendly: this.islandFriendly,
      customModuleInfo: this.serializeField(this.customModuleInfo),
      groupName: this.groupName,
      rtmLogCode: this.rtmLogCode,
      hasNeuralNetParam: this.hasNeuralNetParam,
    };
  }
}
