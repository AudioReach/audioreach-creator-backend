/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  UsecaseResponseDto,
  SubsystemFilteredUsecasesResponseDto,
} from '../../../modules/usecase/dto/usecase-response.dto.js';
import {ComponentsResponseDto} from '../../dto/component-collection-response.dto.js';
import {
  KeyValueInfoDto,
  KeyInfoDto,
  ValueInfoDto,
  SystemIdsRequestDto,
  SubsystemFilteredKeyValuePairsInfoDto,
} from '../../dto/index.js';
import {EndPointLink} from '../../../common/utils/index.js';
import {
  SpfModuleResponseDto,
  DataPortResponseDto,
  ControlPortResponseDto,
} from '../../../modules/spf-module/dto/shared/spf-module-response.dto.js';
import {DataLinkResponseDto} from '../../../modules/data-link/dto/data-link-response.dto.js';
import {ControlLinkResponseDto} from '../../../modules/control-link/dto/control-link-response.dto.js';

function kv(
  keyNaturalId: number,
  keyName: string,
  keySystemId: string,
  valueNaturalId: number,
  valueName: string,
  valueSystemId: string,
): KeyValueInfoDto {
  return Object.assign(new KeyValueInfoDto(), {
    key: Object.assign(new KeyInfoDto(), {
      naturalId: keyNaturalId,
      name: keyName,
      systemId: keySystemId,
    }),
    value: Object.assign(new ValueInfoDto(), {
      naturalId: valueNaturalId,
      name: valueName,
      systemId: valueSystemId,
    }),
  });
}

/**
 * Example provider for SubsystemFilteredUsecases collection
 */
export const SubsystemFilteredUseCaseCollectionExample = {
  getExample(): SubsystemFilteredUsecasesResponseDto[] {
    const ssFilteredUcCollection: SubsystemFilteredUsecasesResponseDto[] = [];

    // Subsystem filtered with multiple raw GKVs underneath
    const ucExamples = UseCaseIdentifierCollectionExample.getExample();
    const keyvalueInfo = [
      kv(
        0xac_db_f1_00,
        'Subsystem',
        'sys1',
        0xf0_10_00_2e,
        'Playback_stream_DevPP',
        'val1',
      ),
      kv(
        0xac_00_00_00,
        'Subsystem',
        'sys2',
        0xf0_10_00_34,
        'Rx_Devices',
        'val2',
      ),
    ];
    const filteredKv = Object.assign(
      new SubsystemFilteredKeyValuePairsInfoDto(),
      {
        keyValuePairs: keyvalueInfo,
      },
    );
    ssFilteredUcCollection.push(
      new SubsystemFilteredUsecasesResponseDto(filteredKv, ucExamples),
    );

    return ssFilteredUcCollection;
  },

  /**
   * Get example showing multiple filtered GKV scenarios
   */
  getFilteredGKVExample(): SubsystemFilteredUsecasesResponseDto[] {
    const collection: SubsystemFilteredUsecasesResponseDto[] = [];

    // First filtered group
    const keyvalueInfo1 = [
      kv(
        0xac_db_f1_00,
        'Subsystem',
        'sys3',
        0xf0_10_00_2e,
        'Playback_stream_DevPP',
        'val3',
      ),
      kv(
        0xac_00_00_00,
        'Subsystem',
        'sys4',
        0xf0_10_00_34,
        'Rx_Devices',
        'val4',
      ),
    ];
    const filteredKv1 = Object.assign(
      new SubsystemFilteredKeyValuePairsInfoDto(),
      {keyValuePairs: keyvalueInfo1},
    );
    const usecases1 = [UsecaseResponseDtoExample.getExample()];
    collection.push(
      new SubsystemFilteredUsecasesResponseDto(filteredKv1, usecases1),
    );

    // Second filtered group
    const keyvalueInfo2 = [
      kv(
        0xac_db_f1_01,
        'Subsystem',
        'sys5',
        0xf0_10_00_3a,
        'Record_stream_DevPP',
        'val5',
      ),
      kv(
        0xac_00_00_01,
        'Subsystem',
        'sys6',
        0xf0_10_00_35,
        'Tx_Devices',
        'val6',
      ),
    ];
    const filteredKv2 = Object.assign(
      new SubsystemFilteredKeyValuePairsInfoDto(),
      {keyValuePairs: keyvalueInfo2},
    );
    const usecases2 = UseCaseIdentifierCollectionExample.getExample();
    collection.push(
      new SubsystemFilteredUsecasesResponseDto(filteredKv2, usecases2),
    );

    return collection;
  },
};

/**
 * Example provider for UseCaseIdentifier
 */
export const UsecaseResponseDtoExample = {
  getExample(): UsecaseResponseDto {
    const keyvalueInfo = [
      kv(
        0xa1_00_00_00,
        'StreamRX',
        'sys7',
        0xa1_00_00_01,
        'PCM_Deep_Buffer',
        'val7',
      ),
      kv(
        0xac_00_00_00,
        'DevicePP_Rx',
        'sys8',
        0xac_00_00_02,
        'Audio_MBDRC',
        'val8',
      ),
      kv(0xa2_00_00_00, 'DeviceRX', 'sys9', 0xa2_00_00_01, 'Speaker', 'val9'),
    ];
    return Object.assign(new UsecaseResponseDto(), {
      systemId: '1',
      usecaseType: 'LINKED',
      keyValuePairs: keyvalueInfo,
      usecaseAliasId: 101,
      usecaseAliasName: 'PCM_Deep_Buffer_MBDRC_Playback_Speaker',
      usecaseCategory: 'default',
    });
  },
};

/**
 * Example provider for UseCaseIdentifier collection
 */
export const UseCaseIdentifierCollectionExample = {
  getExample(): UsecaseResponseDto[] {
    const listOfUsecases: UsecaseResponseDto[] = [];
    listOfUsecases.push(UsecaseResponseDtoExample.getExample());

    const keyvalueInfo = [
      kv(
        0xa1_00_00_00,
        'StreamRX',
        'sys10',
        0xa1_00_00_0f,
        'PCM_Offload',
        'val10',
      ),
      kv(
        0xac_00_00_00,
        'DevicePP_Rx',
        'sys11',
        0xac_00_00_02,
        'Audio_MBDRC',
        'val11',
      ),
      kv(0xa2_00_00_00, 'DeviceRX', 'sys12', 0xa2_00_00_01, 'Speaker', 'val12'),
    ];
    listOfUsecases.push(
      Object.assign(new UsecaseResponseDto(), {
        systemId: '2',
        usecaseType: 'LINKED',
        keyValuePairs: keyvalueInfo,
        usecaseAliasId: 102,
        usecaseAliasName: 'PCM_Offload_MBDRC_Playback_Speaker',
      }),
    );

    return listOfUsecases;
  },
};

/**
 * Example provider for UsecaseComponents
 */
export const UsecaseComponentsExample = {
  getExample(): ComponentsResponseDto {
    // Create the ComponentsResponseDto — populated after building the individual items below
    const componentCollection = new ComponentsResponseDto();

    // Create module instances
    const spfModule1 = Object.assign(new SpfModuleResponseDto(), {
      systemId: '1001',
      naturalId: 1001,
      moduleDefinitionSystemId: '117506309',
      name: 'PCM Decoder',
      alias: 'PCM_Decoder_1',
      subgraphSystemId: '501',
      containerSystemId: '601',
      maxInputPortsSupported: 2,
      maxOutputPortsSupported: 2,
      maxControlPortsSupported: 1,
      relatedEndPointLinks: [
        Object.assign(new EndPointLink(), {
          hypertextRef: '/components/1001/properties',
          method: 'GET',
          description: 'Get properties for a component.',
        }),
      ],
    });

    const spfModule2 = Object.assign(new SpfModuleResponseDto(), {
      systemId: '1002',
      naturalId: 1002,
      moduleDefinitionSystemId: '117506310',
      name: 'Audio MBDRC',
      alias: 'Audio_MBDRC_1',
      subgraphSystemId: '501',
      containerSystemId: '601',
      maxInputPortsSupported: 1,
      maxOutputPortsSupported: 1,
      maxControlPortsSupported: 2,
      relatedEndPointLinks: [
        Object.assign(new EndPointLink(), {
          hypertextRef: '/components/1002/properties',
          method: 'GET',
          description: 'Get properties for a component.',
        }),
      ],
    });

    // Add data ports to modules
    const inputPort1 = Object.assign(new DataPortResponseDto(), {
      systemId: '2001',
      naturalId: 2001,
      name: 'Input',
      portIoType: 'Input' as const,
      portType: 'Static' as const,
      totalLinksAtPort: 0,
      relatedEndPointLinks: [] as EndPointLink[],
    });
    const outputPort1 = Object.assign(new DataPortResponseDto(), {
      systemId: '2002',
      naturalId: 2002,
      name: 'Output',
      portIoType: 'Output' as const,
      portType: 'Static' as const,
      totalLinksAtPort: 0,
      relatedEndPointLinks: [] as EndPointLink[],
    });
    spfModule1.dataPorts = [inputPort1, outputPort1];

    const inputPort2 = Object.assign(new DataPortResponseDto(), {
      systemId: '2003',
      naturalId: 2003,
      name: 'Input',
      portIoType: 'Input' as const,
      portType: 'Static' as const,
      totalLinksAtPort: 0,
      relatedEndPointLinks: [] as EndPointLink[],
    });
    const outputPort2 = Object.assign(new DataPortResponseDto(), {
      systemId: '2004',
      naturalId: 2004,
      name: 'Output',
      portIoType: 'Output' as const,
      portType: 'Static' as const,
      totalLinksAtPort: 0,
      relatedEndPointLinks: [] as EndPointLink[],
    });
    spfModule2.dataPorts = [inputPort2, outputPort2];

    // Add control ports to modules
    const controlPort1 = Object.assign(new ControlPortResponseDto(), {
      systemId: '3001',
      naturalId: 3001,
      name: 'Control',
      portType: 'Static' as const,
      intents: [],
      relatedEndPointLinks: [] as EndPointLink[],
    });
    spfModule1.controlPorts = [controlPort1];

    const controlPort2 = Object.assign(new ControlPortResponseDto(), {
      systemId: '3002',
      naturalId: 3002,
      name: 'Control',
      portType: 'Static' as const,
      intents: [],
      relatedEndPointLinks: [] as EndPointLink[],
    });
    const controlPort3 = Object.assign(new ControlPortResponseDto(), {
      systemId: '3003',
      naturalId: 3003,
      name: 'Control',
      portType: 'Static' as const,
      intents: [],
      relatedEndPointLinks: [] as EndPointLink[],
    });
    spfModule2.controlPorts = [controlPort2, controlPort3];

    componentCollection.spfModules = [
      spfModule1,
      spfModule2,
    ] as unknown as ComponentsResponseDto['spfModules'];

    // Create data links
    const dataConnection = Object.assign(new DataLinkResponseDto(), {
      systemId: '4001',
      sourceSystemId: '1001', // spfModule1
      sourcePortSystemId: '2002', // outputPort1
      destinationSystemId: '1002', // spfModule2
      destinationPortSystemId: '2003', // inputPort2
      isInterUsecase: false,
    });

    componentCollection.dataLinks = [
      dataConnection,
    ] as unknown as ComponentsResponseDto['dataLinks'];

    // Create control links
    const controlLink = Object.assign(new ControlLinkResponseDto(), {
      systemId: '5001',
      sourceSystemId: '1001', // spfModule1
      sourcePortSystemId: '3001', // controlPort1
      destinationSystemId: '1002', // spfModule2
      destinationPortSystemId: '3002', // controlPort2
      isInterUsecase: false,
    });

    componentCollection.controlLinks = [
      controlLink,
    ] as unknown as ComponentsResponseDto['controlLinks'];

    // Return the component collection directly (no wrapper)
    return componentCollection;
  },
};

/**
 * Example provider for UsecaseIdsRequestDTO
 */
export const UseCaseIdCollectionExample = {
  getExample(): SystemIdsRequestDto {
    const request = new SystemIdsRequestDto();
    request.systemIds = ['101', '102', '103', '104', '105'];
    return request;
  },
};
