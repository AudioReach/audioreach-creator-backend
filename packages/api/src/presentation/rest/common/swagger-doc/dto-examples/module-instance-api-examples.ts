/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {EndPointLink} from '../../utils/index.js';
import {SpfModuleDto} from '../../../modules/spf-module/dto/spf-module.dto.js';
import {BaseSpfModuleRequest} from '../../../modules/spf-module/dto/spf-module-request.dto.js';

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
