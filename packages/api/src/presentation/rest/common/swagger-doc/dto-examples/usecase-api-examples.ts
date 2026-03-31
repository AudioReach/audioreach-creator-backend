/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  UsecaseIdentifierDto,
  SubsystemFilteredUsecasesDto,
  UsecaseType,
  UsecaseComponentsDto,
  UsecaseWithModificationSummary,
  UsecaseWithComponents,
} from '../../../modules/usecase/dto/usecase.dto.js';
import {ComponentCollectionDto} from '../../dto/component-collection.dto.js';
import {
  BaseComponentDto,
  KeyValuePairsInfo,
  KeyValueInfo,
  KeyInfo,
  ValueInfo,
  SystemIdsRequestDto,
  SubsystemFilteredKeyValuePairsInfo,
} from '../../dto/index.js';
import {
  ModificationAction,
  EndPointLink,
  CONN_CTRL_TYPE,
} from '../../../common/utils/index.js';
import {SpfModuleDto} from '../../../modules/spf-module/dto/shared/spf-module.dto.js';
import {DataPortDto, PortType, PortIoType} from '../../dto/data-port.dto.js';
import {ControlPortDto} from '../../dto/control-port.dto.js';
import {DataLinkDto} from '../../../modules/data-link/dto/data-link.dto.js';
import {ControlLinkDto} from '../../../modules/control-link/dto/control-link.dto.js';

/**
 * Example provider for SubsystemFilteredUsecases collection
 */
export const SubsystemFilteredUseCaseCollectionExample = {
  getExample(): SubsystemFilteredUsecasesDto[] {
    const ssFilteredUcCollection: SubsystemFilteredUsecasesDto[] = [];

    // Subsystem filtered with multiple raw GKVs underneath
    const ucExamples = UseCaseIdentifierCollectionExample.getExample();
    const keyvalueInfo = [
      new KeyValueInfo(
        new KeyInfo(0xac_db_f1_00, 'Subsystem', 'sys1'),
        new ValueInfo(0xf0_10_00_2e, 'Playback_stream_DevPP', 'val1'),
      ),
      new KeyValueInfo(
        new KeyInfo(0xac_00_00_00, 'Subsystem', 'sys2'),
        new ValueInfo(0xf0_10_00_34, 'Rx_Devices', 'val2'),
      ),
    ];
    const filteredKv = new SubsystemFilteredKeyValuePairsInfo(keyvalueInfo);
    ssFilteredUcCollection.push(
      new SubsystemFilteredUsecasesDto(filteredKv, ucExamples),
    );

    return ssFilteredUcCollection;
  },

  /**
   * Get example showing multiple filtered GKV scenarios
   */
  getFilteredGKVExample(): SubsystemFilteredUsecasesDto[] {
    const collection: SubsystemFilteredUsecasesDto[] = [];

    // First filtered group
    const keyvalueInfo1 = [
      new KeyValueInfo(
        new KeyInfo(0xac_db_f1_00, 'Subsystem', 'sys3'),
        new ValueInfo(0xf0_10_00_2e, 'Playback_stream_DevPP', 'val3'),
      ),
      new KeyValueInfo(
        new KeyInfo(0xac_00_00_00, 'Subsystem', 'sys4'),
        new ValueInfo(0xf0_10_00_34, 'Rx_Devices', 'val4'),
      ),
    ];
    const filteredKv1 = new SubsystemFilteredKeyValuePairsInfo(keyvalueInfo1);
    const usecases1 = [UsecaseIdentifierDtoExample.getExample()];
    collection.push(new SubsystemFilteredUsecasesDto(filteredKv1, usecases1));

    // Second filtered group
    const keyvalueInfo2 = [
      new KeyValueInfo(
        new KeyInfo(0xac_db_f1_01, 'Subsystem', 'sys5'),
        new ValueInfo(0xf0_10_00_3a, 'Record_stream_DevPP', 'val5'),
      ),
      new KeyValueInfo(
        new KeyInfo(0xac_00_00_01, 'Subsystem', 'sys6'),
        new ValueInfo(0xf0_10_00_35, 'Tx_Devices', 'val6'),
      ),
    ];
    const filteredKv2 = new SubsystemFilteredKeyValuePairsInfo(keyvalueInfo2);
    const usecases2 = UseCaseIdentifierCollectionExample.getExample();
    collection.push(new SubsystemFilteredUsecasesDto(filteredKv2, usecases2));

    return collection;
  },
};

/**
 * Example provider for UseCaseIdentifier
 */
export const UsecaseIdentifierDtoExample = {
  getExample(): UsecaseIdentifierDto {
    const keyvalueInfo = [
      new KeyValueInfo(
        new KeyInfo(0xa1_00_00_00, 'StreamRX', 'sys7'),
        new ValueInfo(0xa1_00_00_01, 'PCM_Deep_Buffer', 'val7'),
      ),
      new KeyValueInfo(
        new KeyInfo(0xac_00_00_00, 'DevicePP_Rx', 'sys8'),
        new ValueInfo(0xac_00_00_02, 'Audio_MBDRC', 'val8'),
      ),
      new KeyValueInfo(
        new KeyInfo(0xa2_00_00_00, 'DeviceRX', 'sys9'),
        new ValueInfo(0xa2_00_00_01, 'Speaker', 'val9'),
      ),
    ];
    const kvInfo = new KeyValuePairsInfo(keyvalueInfo);
    return new UsecaseIdentifierDto(
      '1',
      UsecaseType.Regular,
      kvInfo,
      101,
      'PCM_Deep_Buffer_MBDRC_Playback_Speaker',
      'default',
    );
  },
};

/**
 * Example provider for UseCaseIdentifier collection
 */
export const UseCaseIdentifierCollectionExample = {
  getExample(): UsecaseIdentifierDto[] {
    const listOfUsecases: UsecaseIdentifierDto[] = [];
    listOfUsecases.push(UsecaseIdentifierDtoExample.getExample());

    const keyvalueInfo = [
      new KeyValueInfo(
        new KeyInfo(0xa1_00_00_00, 'StreamRX', 'sys10'),
        new ValueInfo(0xa1_00_00_0f, 'PCM_Offload', 'val10'),
      ),
      new KeyValueInfo(
        new KeyInfo(0xac_00_00_00, 'DevicePP_Rx', 'sys11'),
        new ValueInfo(0xac_00_00_02, 'Audio_MBDRC', 'val11'),
      ),
      new KeyValueInfo(
        new KeyInfo(0xa2_00_00_00, 'DeviceRX', 'sys12'),
        new ValueInfo(0xa2_00_00_01, 'Speaker', 'val12'),
      ),
    ];
    const kvInfo = new KeyValuePairsInfo(keyvalueInfo);
    listOfUsecases.push(
      new UsecaseIdentifierDto(
        '2',
        UsecaseType.Regular,
        kvInfo,
        102,
        'PCM_Offload_MBDRC_Playback_Speaker',
      ),
    );

    return listOfUsecases;
  },
};

/**
 * Example provider for UsecaseComponents
 */
export const UsecaseComponentsExample = {
  getExample(): UsecaseComponentsDto {
    // Create a usecase identifier for the components
    const usecaseIdentifier = UsecaseIdentifierDtoExample.getExample();

    // Create the ComponentCollectionDto
    const componentCollection = new ComponentCollectionDto();

    // Create module instances
    const spfModule1 = new SpfModuleDto(
      '1001',
      1001,
      0x07_01_01_05,
      'PCM Decoder',
    );
    spfModule1.alias = 'PCM_Decoder_1';
    spfModule1.subgraphId = 501;
    spfModule1.containerId = 601;
    spfModule1.maxInputPortsSupported = 2;
    spfModule1.maxOutputPortsSupported = 2;
    spfModule1.maxControlPortsSupported = 1;
    spfModule1.heapId = 1;

    const spfModule2 = new SpfModuleDto(
      '1002',
      1002,
      0x07_01_01_06,
      'Audio MBDRC',
    );
    spfModule2.alias = 'Audio_MBDRC_1';
    spfModule2.subgraphId = 501;
    spfModule2.containerId = 601;
    spfModule2.maxInputPortsSupported = 1;
    spfModule2.maxOutputPortsSupported = 1;
    spfModule2.maxControlPortsSupported = 2;
    spfModule2.heapId = 1;

    // Add data ports to modules
    const inputPort1 = new DataPortDto(
      '2001',
      2001,
      'Input',
      PortIoType.Input,
      PortType.Static,
    );
    const outputPort1 = new DataPortDto(
      '2002',
      2002,
      'Output',
      PortIoType.Output,
      PortType.Static,
    );
    spfModule1.dataPorts = [inputPort1, outputPort1];

    const inputPort2 = new DataPortDto(
      '2003',
      2003,
      'Input',
      PortIoType.Input,
      PortType.Static,
    );
    const outputPort2 = new DataPortDto(
      '2004',
      2004,
      'Output',
      PortIoType.Output,
      PortType.Static,
    );
    spfModule2.dataPorts = [inputPort2, outputPort2];

    // Add control ports to modules
    const controlPort1 = new ControlPortDto(
      '3001',
      3001,
      'Control',
      PortType.Static,
      [],
    );
    spfModule1.controlPorts = [controlPort1];

    const controlPort2 = new ControlPortDto(
      '3002',
      3002,
      'Control',
      PortType.Static,
      [],
    );
    const controlPort3 = new ControlPortDto(
      '3003',
      3003,
      'Control',
      PortType.Static,
      [],
    );
    spfModule2.controlPorts = [controlPort2, controlPort3];

    componentCollection.spfModules = [spfModule1, spfModule2];

    // Create data links
    const dataConnection = new DataLinkDto(
      '4001',
      4001,
      CONN_CTRL_TYPE.MODULE_MODULE,
      1001, // sourceId (spfModule1)
      2002, // sourcePortId (outputPort1)
      1002, // destinationId (spfModule2)
      2003, // destinationPortId (inputPort2)
      false, // isDangling
      601, // parentId (containerId)
    );
    dataConnection.name = 'data_link';

    componentCollection.dataLinks = [dataConnection];

    // Create control links
    const controlLink = new ControlLinkDto(
      '5001',
      5001,
      CONN_CTRL_TYPE.MODULE_MODULE,
      1001, // sourceId (spfModule1)
      3001, // sourcePortId (controlPort1)
      1002, // destinationId (spfModule2)
      3002, // destinationPortId (controlPort2)
      false, // isDangling
      601, // parentId (containerId)
    );
    controlLink.name = 'control_link';

    componentCollection.controlLinks = [controlLink];

    // Create the UsecaseComponentsDto wrapper with usecase identifiers and components
    return new UsecaseComponentsDto([usecaseIdentifier], componentCollection);
  },
};

/**
 * Example provider for UsecaseWithComponents
 */
export const UsecaseWithComponentsExample = {
  getExample(): UsecaseWithComponents {
    // Create a usecase with components using the UsecaseIdentifierDto example
    const usecaseIdentifier = UsecaseIdentifierDtoExample.getExample();
    const usecaseWithComponents = new UsecaseWithComponents(usecaseIdentifier);

    // Get the grouped components and flatten them for backward compatibility
    const usecaseComponentsDto = UsecaseComponentsExample.getExample();
    const componentCollection = usecaseComponentsDto.components;
    const flatComponents: BaseComponentDto<number>[] = [
      ...componentCollection.spfModules,
      ...componentCollection.dataLinks,
      ...componentCollection.controlLinks,
    ];

    // Add components to the usecase
    usecaseWithComponents.components = flatComponents;

    return usecaseWithComponents;
  },

  /**
   * Get a more complex example with additional components
   */
  getComplexExample(): UsecaseWithComponents {
    // Create a usecase with components using a custom UseCaseIdentifier
    const keyvalueInfo = [
      new KeyValueInfo(
        new KeyInfo(0xa1_00_00_00, 'StreamRX', 'sys13'),
        new ValueInfo(0xa1_00_00_02, 'PCM_Low_Latency', 'val13'),
      ),
      new KeyValueInfo(
        new KeyInfo(0xac_00_00_00, 'DevicePP_Rx', 'sys14'),
        new ValueInfo(0xac_00_00_03, 'Audio_EQ', 'val14'),
      ),
      new KeyValueInfo(
        new KeyInfo(0xa2_00_00_00, 'DeviceRX', 'sys15'),
        new ValueInfo(0xa2_00_00_02, 'Headphones', 'val15'),
      ),
    ];
    const kvInfo = new KeyValuePairsInfo(keyvalueInfo);
    const usecaseIdentifier = new UsecaseIdentifierDto(
      '1',
      UsecaseType.Regular,
      kvInfo,
      103,
      'PCM_Low_Latency_EQ_Playback_Headphones',
      'Headphone_Playback',
    );

    // Add endpoint links
    const link1 = new EndPointLink();
    link1.hypertextRef = `/usecases/${usecaseIdentifier.systemId}/components`;
    link1.method = 'GET';
    link1.description = 'Get all components of usecase.';

    const link2 = new EndPointLink();
    link2.hypertextRef = `/usecases/${usecaseIdentifier.systemId}/status`;
    link2.method = 'GET';
    link2.description = 'Get status of usecase.';

    // Create the usecase with components
    const usecaseWithComponents = new UsecaseWithComponents(usecaseIdentifier);

    // Get base components
    const baseComponents = UsecaseComponentsExample.getExample();

    // Add additional components

    // Create an EQ module instance
    const eqModule = new SpfModuleDto('1003', 1003, 0x07_00_10_17, 'Audio EQ');
    eqModule.alias = 'Audio_EQ_1';
    eqModule.subgraphId = 501;
    eqModule.containerId = 601;
    eqModule.maxInputPortsSupported = 1;
    eqModule.maxOutputPortsSupported = 1;
    eqModule.maxControlPortsSupported = 2;
    eqModule.heapId = 1;

    // Add data ports to EQ module
    const eqInputPort = new DataPortDto(
      '2005',
      2005,
      'Input',
      PortIoType.Input,
      PortType.Static,
    );
    const eqOutputPort = new DataPortDto(
      '2006',
      2006,
      'Output',
      PortIoType.Output,
      PortType.Static,
    );
    eqModule.dataPorts = [eqInputPort, eqOutputPort];

    // Add control ports to EQ module
    const eqControlPort1 = new ControlPortDto(
      '3004',
      3004,
      'Control',
      PortType.Static,
      [],
    );
    const eqControlPort2 = new ControlPortDto(
      '3005',
      3005,
      'Control',
      PortType.Static,
      [],
    );
    eqModule.controlPorts = [eqControlPort1, eqControlPort2];

    // Find the MBDRC module from base components (for reference)
    const baseComponentCollection = baseComponents.components;
    const mbdrcModule = baseComponentCollection.spfModules.find(
      (c: SpfModuleDto) => c.id === 1002,
    );
    if (!mbdrcModule) {
      throw new Error('MBDRC module not found in base components');
    }

    // Create a data connection from MBDRC to EQ
    const dataConnection = new DataLinkDto(
      '4002',
      4002,
      CONN_CTRL_TYPE.MODULE_MODULE,
      1002, // sourceId (MBDRC module)
      2004, // sourcePortId (MBDRC output port)
      1003, // destinationId (EQ module)
      2005, // destinationPortId (EQ input port)
      false, // isDangling
      601, // parentId (containerId)
    );
    dataConnection.name = 'MBDRC_to_EQ';

    // Create a control connection to EQ
    const controlConnection = new ControlLinkDto(
      '5002',
      5002,
      CONN_CTRL_TYPE.MODULE_MODULE,
      1002, // sourceId (MBDRC module)
      3003, // sourcePortId (MBDRC control port)
      1003, // destinationId (EQ module)
      3004, // destinationPortId (EQ control port)
      false, // isDangling
      601, // parentId (containerId)
    );

    // Combine all components
    const allComponents: BaseComponentDto<number>[] = [
      ...baseComponentCollection.spfModules,
      ...baseComponentCollection.dataLinks,
      ...baseComponentCollection.controlLinks,
      eqModule,
      dataConnection,
      controlConnection,
    ];
    usecaseWithComponents.components = allComponents;

    return usecaseWithComponents;
  },
};

/**
 * Example provider for UsecaseWithModificationSummary
 */
export const UsecaseWithModificationSummaryExample = {
  getExample(): UsecaseWithModificationSummary {
    // Get a usecase with components
    const usecaseWithComponents = UsecaseWithComponentsExample.getExample();

    // Create a modification summary
    return new UsecaseWithModificationSummary(
      usecaseWithComponents,
      ModificationAction.Add,
      'Added new usecase for PCM Deep Buffer with MBDRC processing for Speaker playback',
    );
  },

  getModifiedExample(): UsecaseWithModificationSummary {
    // Get a complex usecase with components
    const usecaseWithComponents =
      UsecaseWithComponentsExample.getComplexExample();

    // Create a modification summary for a modified usecase
    return new UsecaseWithModificationSummary(
      usecaseWithComponents,
      ModificationAction.Update,
      'Modified usecase to add EQ processing for Headphone playback',
    );
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
