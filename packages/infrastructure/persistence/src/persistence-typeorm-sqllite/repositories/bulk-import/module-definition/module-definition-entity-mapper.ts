/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {SpfModuleDefinition} from '@arc/core';
import type {
  SpfModuleDefinitionRow,
  DataPortGroupRow,
  DataPortDefinitionRow,
  StaticControlPortDefinitionRow,
} from '../../../entity-schema/index.js';
import {PortIoType} from '../../../entity-schema/definitions/module/spf/port-io-type-definition.schema.js';
import {PORT_IO_TYPE} from '@arc/core';

/**
 * Maps SpfModuleDefinition domain entity to SpfModuleDefinitionRow for database insertion.
 * Uses type assertion for missing audit fields (creationDate, updateDate) as they will be handled by the database.
 *
 * @param moduleDefinition - SpfModuleDefinition domain entity without systemId
 * @returns SpfModuleDefinitionRow ready for batch insertion
 */
export function toSpfModuleDefinitionRow(
  moduleDefinition: Omit<SpfModuleDefinition, 'systemId'>,
): SpfModuleDefinitionRow {
  // Map data port groups (input and output)
  const dataPortGroups: Partial<DataPortGroupRow>[] = [];

  // Map input port group
  const inputDataPortsGroup = moduleDefinition.dataPortGroups.find(
    dp => dp.portIoType == PORT_IO_TYPE.Input,
  );
  if (inputDataPortsGroup) {
    const inputGroup: Partial<DataPortGroupRow> = {
      max: inputDataPortsGroup.maxAllowedPortCount,
      portIoType: inputDataPortsGroup.portIoType as PortIoType,
      ports: inputDataPortsGroup.staticPortDefinitions.map(port => ({
        dataPortId: port.dataPortId,
        name: port.dataPortName,
      })) as unknown as DataPortDefinitionRow[],
    };
    dataPortGroups.push(inputGroup);
  }

  // Map output port group
  const outputDataPortsGroup = moduleDefinition.dataPortGroups.find(
    dp => dp.portIoType == PORT_IO_TYPE.Output,
  );
  if (outputDataPortsGroup) {
    const outputGroup: Partial<DataPortGroupRow> = {
      max: outputDataPortsGroup.maxAllowedPortCount,
      portIoType: outputDataPortsGroup.portIoType as PortIoType,
      ports: outputDataPortsGroup.staticPortDefinitions.map(port => ({
        dataPortId: port.dataPortId,
        name: port.dataPortName,
      })) as unknown as DataPortDefinitionRow[],
    };
    dataPortGroups.push(outputGroup);
  }

  // Map static control ports
  const staticPorts: Partial<StaticControlPortDefinitionRow>[] =
    moduleDefinition.staticControlPorts?.map(
      port =>
        ({
          portId: port.portId,
          name: port.portName,
        }) as Partial<StaticControlPortDefinitionRow>,
    ) || [];

  return {
    moduleDefinitionId: moduleDefinition.moduleDefinitionId,
    name: moduleDefinition.name,
    displayName: moduleDefinition.displayName,
    description: moduleDefinition.description,
    groupName: moduleDefinition.groupName,
    fileSystemId: moduleDefinition.fileSystemId,
    stackSize: 0, // Default value as per schema
    dataPortGroups: dataPortGroups.length > 0 ? dataPortGroups : undefined,
    staticPorts: staticPorts.length > 0 ? staticPorts : undefined,
  } as SpfModuleDefinitionRow;
}
