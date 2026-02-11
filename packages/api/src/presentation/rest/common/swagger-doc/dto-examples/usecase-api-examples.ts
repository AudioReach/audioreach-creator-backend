/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  UsecaseIdentifier,
  UsecaseDto,
  UsecaseType,
  UsecaseComponentsDto,
  UsecaseWithModificationSummary,
  UsecaseWithComponents,
} from '../../../modules/usecase/dto/usecase.dto.js';
import {
  BaseComponentDto,
  KeyValuePairsInfo,
  KeyValueInfo,
  KeyInfo,
  ValueInfo,
  SystemIdsRequestDto,
} from '../../dto/index.js';
import {
  ModificationAction,
  EndPointLink,
  CONN_CTRL_TYPE,
} from '../../../common/utils/index.js';
import {ModuleInstanceDto} from '../../../modules/module-instance/dto/module-instance.dto.js';
import {DataPortDto, PortType, PortIoType} from '../../dto/data-port.dto.js';
import {ControlPortDto} from '../../dto/control-port.dto.js';
import {DataLinkDto} from '../../../modules/data-link/dto/data-link.dto.js';
import {ControlLinkDto} from '../../../modules/control-link/dto/control-link.dto.js';
import {subsystemApiExample} from './subsystem-api-example.js';

/**
 * Example provider for SubsystemFilteredUsecase collection
 */
export const SubsystemFilteredUseCaseCollectionExample = {
  getExample(): UsecaseDto[] {
    const ssFilteredUcCollection: UsecaseDto[] = [];

    // Scenario 1: Raw GKV (isFiltered = false)
    // Single usecase with no subsystem filtering
    const rawUsecase = UsecaseIdentifierExample.getExample();
    ssFilteredUcCollection.push(UsecaseDto.createRawGKVResponse(rawUsecase));

    // Scenario 2: Filtered GKV (isFiltered = true)
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
    const filteredKv = new KeyValuePairsInfo(keyvalueInfo);
    ssFilteredUcCollection.push(
      UsecaseDto.createFilteredGKVResponse(
        'subsystem_1',
        filteredKv,
        ucExamples,
      ),
    );

    return ssFilteredUcCollection;
  },

  /**
   * Get example showing only raw GKV scenarios
   */
  getRawGKVExample(): UsecaseDto[] {
    const collection: UsecaseDto[] = [];
    const usecases = UseCaseIdentifierCollectionExample.getExample();

    // Each usecase becomes a separate raw GKV response
    for (const usecase of usecases) {
      collection.push(UsecaseDto.createRawGKVResponse(usecase));
    }

    return collection;
  },

  /**
   * Get example showing only filtered GKV scenarios
   */
  getFilteredGKVExample(): UsecaseDto[] {
    const collection: UsecaseDto[] = [];

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
    const filteredKv1 = new KeyValuePairsInfo(keyvalueInfo1);
    const usecases1 = [UsecaseIdentifierExample.getExample()];
    collection.push(
      UsecaseDto.createFilteredGKVResponse(
        'subsystem_1',
        filteredKv1,
        usecases1,
      ),
    );

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
    const filteredKv2 = new KeyValuePairsInfo(keyvalueInfo2);
    const usecases2 = UseCaseIdentifierCollectionExample.getExample();
    collection.push(
      UsecaseDto.createFilteredGKVResponse(
        'subsystem_2',
        filteredKv2,
        usecases2,
      ),
    );

    return collection;
  },
};

/**
 * Example provider for UseCaseIdentifier
 */
export const UsecaseIdentifierExample = {
  getExample(): UsecaseIdentifier {
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
    return new UsecaseIdentifier(
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
  getExample(): UsecaseIdentifier[] {
    const listOfUsecases: UsecaseIdentifier[] = [];
    listOfUsecases.push(UsecaseIdentifierExample.getExample());

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
      new UsecaseIdentifier(
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
    const usecaseIdentifier = UsecaseIdentifierExample.getExample();

    // Create the UsecaseComponentsDto with the usecase identifier
    const usecaseComponents = new UsecaseComponentsDto(usecaseIdentifier);

    // Add subsystem example
    usecaseComponents.subsystems = [subsystemApiExample];

    // Create module instances
    const moduleInstance1 = new ModuleInstanceDto(
      '1001',
      1001,
      0x07_01_01_05,
      'PCM Decoder',
    );
    moduleInstance1.alias = 'PCM_Decoder_1';
    moduleInstance1.subgraphId = 501;
    moduleInstance1.containerId = 601;
    moduleInstance1.maxInputPortsSupported = 2;
    moduleInstance1.maxOutputPortsSupported = 2;
    moduleInstance1.maxControlPortsSupported = 1;
    moduleInstance1.heapId = 1;

    const moduleInstance2 = new ModuleInstanceDto(
      '1002',
      1002,
      0x07_01_01_06,
      'Audio MBDRC',
    );
    moduleInstance2.alias = 'Audio_MBDRC_1';
    moduleInstance2.subgraphId = 501;
    moduleInstance2.containerId = 601;
    moduleInstance2.maxInputPortsSupported = 1;
    moduleInstance2.maxOutputPortsSupported = 1;
    moduleInstance2.maxControlPortsSupported = 2;
    moduleInstance2.heapId = 1;

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
    moduleInstance1.dataPorts = [inputPort1, outputPort1];

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
    moduleInstance2.dataPorts = [inputPort2, outputPort2];

    // Add control ports to modules
    const controlPort1 = new ControlPortDto(
      '3001',
      3001,
      'Control',
      PortType.Static,
      [],
    );
    moduleInstance1.controlPorts = [controlPort1];

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
    moduleInstance2.controlPorts = [controlPort2, controlPort3];

    usecaseComponents.moduleInstances = [moduleInstance1, moduleInstance2];

    // Create data links
    const dataConnection = new DataLinkDto(
      '4001',
      4001,
      CONN_CTRL_TYPE.MODULE_MODULE,
      1001, // sourceId (moduleInstance1)
      2002, // sourcePortId (outputPort1)
      1002, // destinationId (moduleInstance2)
      2003, // destinationPortId (inputPort2)
      false, // isDangling
      601, // parentId (containerId)
    );
    dataConnection.name = 'data_link';

    usecaseComponents.dataLinks = [dataConnection];

    // Create control links
    const controlLink = new ControlLinkDto(
      '5001',
      5001,
      CONN_CTRL_TYPE.MODULE_MODULE,
      1001, // sourceId (moduleInstance1)
      3001, // sourcePortId (controlPort1)
      1002, // destinationId (moduleInstance2)
      3002, // destinationPortId (controlPort2)
      false, // isDangling
      601, // parentId (containerId)
    );
    controlLink.name = 'control_link';

    usecaseComponents.controlLinks = [controlLink];

    return usecaseComponents;
  },
};

/**
 * Example provider for UsecaseWithComponents
 */
export const UsecaseWithComponentsExample = {
  getExample(): UsecaseWithComponents {
    // Create a usecase with components using the UseCaseIdentifier example
    const usecaseIdentifier = UsecaseIdentifierExample.getExample();
    const usecaseWithComponents = new UsecaseWithComponents(usecaseIdentifier);

    // Get the grouped components and flatten them for backward compatibility
    const groupedComponents = UsecaseComponentsExample.getExample();
    const flatComponents: BaseComponentDto<number>[] = [
      ...groupedComponents.subsystems,
      ...groupedComponents.moduleInstances,
      ...groupedComponents.dataLinks,
      ...groupedComponents.controlLinks,
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
    const usecaseIdentifier = new UsecaseIdentifier(
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
    const eqModule = new ModuleInstanceDto(
      '1003',
      1003,
      0x07_00_10_17,
      'Audio EQ',
    );
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
    const mbdrcModule = baseComponents.moduleInstances.find(c => c.id === 1002);
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
      ...baseComponents.subsystems,
      ...baseComponents.moduleInstances,
      ...baseComponents.dataLinks,
      ...baseComponents.controlLinks,
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
