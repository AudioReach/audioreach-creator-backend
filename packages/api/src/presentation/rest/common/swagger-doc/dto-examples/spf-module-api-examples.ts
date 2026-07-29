/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {EndPointLink} from '../../utils/index.js';
import {SpfModuleDto} from '../../../modules/spf-module/dto/shared/spf-module.dto.js';
import {CreateSpfModuleRequestDto} from '../../../modules/spf-module/dto/request/spf-module-request.dto.js';

/**
 * Example provider for CreateSpfModuleRequestExample
 */
export const CreateSpfModuleRequestExample = {
  /**
   * Returns an example CreateSpfModuleRequest object
   */
  getExample(): CreateSpfModuleRequestDto {
    return {
      moduleDefinitionId: 135_266_313,
      processorSystemId: 2,
      parentSystemId: 100,
      subgraphSystemId: 200,
      containerSystemId: 300,
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
