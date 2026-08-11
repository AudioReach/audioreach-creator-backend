/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {EndPointLink} from '../../utils/index.js';
import {SpfModuleResponseDto} from '../../../modules/spf-module/dto/shared/spf-module-response.dto.js';
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
  getExample(): SpfModuleResponseDto {
    const endPointLink = new EndPointLink();
    endPointLink.hypertextRef = `/components/1/properties`;
    endPointLink.method = 'GET';
    endPointLink.description = 'Get properties for this module instance.';

    return Object.assign(new SpfModuleResponseDto(), {
      systemId: '1',
      id: 1,
      moduleId: 123,
      name: 'Example Module',
      alias: 'ExampleAlias',
      subgraphId: 456,
      containerId: 789,
      maxInputPortsSupported: 5,
      maxOutputPortsSupported: 3,
      maxControlPortsSupported: 2,
      parentId: 202,
      dataPorts: [],
      controlPorts: [],
      relatedEndPointLinks: [endPointLink],
    });
  },
};
