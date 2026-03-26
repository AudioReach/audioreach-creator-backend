/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {EndPointLink} from '../../utils/index.js';
import {SpfModuleDto} from '../../../modules/spf-module/dto/spf-module.dto.js';
import {BaseSpfModuleRequest} from '../../../modules/spf-module/dto/spf-module-request.dto.js';
import {
  SpfModuleTuningConfigDto,
  CkvDto,
  TagInfoDto,
  TkvDto,
  ParamInfo,
} from '../../../modules/spf-module/dto/tuning-config.dto.js';
import {KeyValueInfo, KeyInfo, ValueInfo} from '../../dto/kv.dto.js';

/**
 * Interface for NewSpfModuleRequest
 */
export interface NewSpfModuleRequest {
  moduleId: number;
  heapId?: number;
  parentId?: number;
  alias?: string;
  instanceId?: number;
}

/**
 * Interface for CloneSpfModuleRequest
 */
export interface CloneSpfModuleRequest {
  moduleId: number;
  alias?: string;
  parentId?: number;
  instanceId?: number;
}

/**
 * Example provider for NewSpfModuleRequestExample
 */
export const NewSpfModuleRequestExample = {
  getExample(): BaseSpfModuleRequest {
    return {
      moduleId: 0x07_00_10_15,
      procId: 2,
      parentId: 0x0f_00_00_01,
      subgraphId: 0xb0_00_00_01,
      containerId: 0xe0_00_00_01,
    };
  },
};

/**
 * Example provider for CloneSpfModuleRequestExample
 */
export const CloneSpfModuleRequestExample = {
  getExample(): CloneSpfModuleRequest {
    return {
      moduleId: 0x07_00_10_15,
      alias: undefined,
      parentId: 0xb0_00_00_01,
      instanceId: 0xe0_00_00_01,
    };
  },
};

/**
 * Example provider for SpfModuleDTO
 */
export const SpfModuleDTOExample = {
  getExample(): SpfModuleDto {
    const spfModule = new SpfModuleDto('1', 1, 123, 'Example Module');

    // Set all required properties
    spfModule.alias = 'ExampleAlias';
    spfModule.subgraphId = 456;
    spfModule.containerId = 789;
    spfModule.maxInputPortsSupported = 5;
    spfModule.maxOutputPortsSupported = 3;
    spfModule.maxControlPortsSupported = 2;
    spfModule.heapId = 101;
    spfModule.parentId = 202;

    // Set inherited properties
    spfModule.dataPorts = [];
    spfModule.controlPorts = [];

    // Add a related endpoint link
    const endPointLink = new EndPointLink();
    endPointLink.hypertextRef = `/components/1/properties`;
    endPointLink.method = 'GET';
    endPointLink.description = 'Get properties for this module instance.';
    spfModule.relatedEndPointLinks = [endPointLink];

    return spfModule;
  },
};

/**
 * Example provider for SpfModuleTuningConfigExample
 */
export const SpfModuleTuningConfigExample = {
  getExample(): SpfModuleTuningConfigDto {
    // Create sample parameters for CKV
    const ckvParam1 = new ParamInfo(
      1001,
      'PARAM_SYS_001',
      'SampleRate',
      'Audio sample rate configuration parameter',
    );
    const ckvParam2 = new ParamInfo(
      1002,
      'PARAM_SYS_002',
      'BitDepth',
      'Audio bit depth configuration parameter',
    );

    // Create sample key-value for CKV
    const ckvKey = new KeyInfo(1, 'SampleRate', 'KEY_SYS_001');
    const ckvValue = new ValueInfo(10, '48000', 'VAL_SYS_001');
    const ckvKeyValue = new KeyValueInfo(ckvKey, ckvValue);

    // Create CKV
    const ckv = new CkvDto('101', [ckvKeyValue], [ckvParam1, ckvParam2]);

    // Create sample parameters for TKV
    const tkvParam1 = new ParamInfo(
      2001,
      'PARAM_SYS_003',
      'Channels',
      'Audio channel configuration parameter',
    );
    const tkvParam2 = new ParamInfo(
      2002,
      'PARAM_SYS_004',
      'Volume',
      'Audio volume level parameter',
    );

    // Create sample key-value for TKV
    const tkvKey = new KeyInfo(2, 'Channels', 'KEY_SYS_002');
    const tkvValue = new ValueInfo(20, 'Stereo', 'VAL_SYS_002');
    const tkvKeyValue = new KeyValueInfo(tkvKey, tkvValue);

    // Create TKV
    const tkv = new TkvDto('202', [tkvKeyValue], [tkvParam1, tkvParam2]);

    // Create Tag with TKVs
    const tag = new TagInfoDto(201, 301, 'AudioProcessing', [tkv]);

    // Create and return the complete tuning configuration
    return new SpfModuleTuningConfigDto('12345', [ckv], [tag]);
  },
};
