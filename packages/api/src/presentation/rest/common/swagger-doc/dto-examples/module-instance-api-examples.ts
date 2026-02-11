/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {EndPointLink} from '../../utils/index.js';
import {ModuleInstanceDto} from '../../../modules/module-instance/dto/module-instance.dto.js';
import {BaseModuleInstanceRequest} from '../../../modules/module-instance/dto/module-instance-request.dto.js';

/**
 * Interface for NewModuleInstanceRequest
 */
export interface NewModuleInstanceRequest {
  moduleId: number;
  heapId?: number;
  parentId?: number;
  alias?: string;
  instanceId?: number;
}

/**
 * Interface for CloneModuleInstanceRequest
 */
export interface CloneModuleInstanceRequest {
  moduleId: number;
  alias?: string;
  parentId?: number;
  instanceId?: number;
}

/**
 * Example provider for NewModuleInstanceRequest
 */
export const NewModuleInstanceRequestExample = {
  getExample(): BaseModuleInstanceRequest {
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
 * Example provider for CloneModuleInstanceRequest
 */
export const CloneModuleInstanceRequestExample = {
  getExample(): CloneModuleInstanceRequest {
    return {
      moduleId: 0x07_00_10_15,
      alias: undefined,
      parentId: 0xb0_00_00_01,
      instanceId: 0xe0_00_00_01,
    };
  },
};

/**
 * Example provider for ModuleInstanceDTO
 */
export const ModuleInstanceDTOExample = {
  getExample(): ModuleInstanceDto {
    const moduleInstance = new ModuleInstanceDto('1', 1, 123, 'Example Module');

    // Set all required properties
    moduleInstance.alias = 'ExampleAlias';
    moduleInstance.subgraphId = 456;
    moduleInstance.containerId = 789;
    moduleInstance.maxInputPortsSupported = 5;
    moduleInstance.maxOutputPortsSupported = 3;
    moduleInstance.maxControlPortsSupported = 2;
    moduleInstance.heapId = 101;
    moduleInstance.parentId = 202;

    // Set inherited properties
    moduleInstance.dataPorts = [];
    moduleInstance.controlPorts = [];

    // Add a related endpoint link
    const endPointLink = new EndPointLink();
    endPointLink.hypertextRef = `/components/1/properties`;
    endPointLink.method = 'GET';
    endPointLink.description = 'Get properties for this module instance.';
    moduleInstance.relatedEndPointLinks = [endPointLink];

    return moduleInstance;
  },
};
