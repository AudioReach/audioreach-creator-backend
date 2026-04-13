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
  if (moduleDefinition.inputDataPortsGroup) {
    const inputGroup: Partial<DataPortGroupRow> = {
      max: moduleDefinition.inputDataPortsGroup.maxAllowedPortCount,
      portIoType: moduleDefinition.inputDataPortsGroup.portIoType as PortIoType,
      ports: moduleDefinition.inputDataPortsGroup.staticPortDefinitions.map(
        port => ({
          dataPortId: port.dataPortId,
          name: port.dataPortName,
        }),
      ) as unknown as DataPortDefinitionRow[],
    };
    dataPortGroups.push(inputGroup);
  }

  // Map output port group
  if (moduleDefinition.outputDataPortsGroup) {
    const outputGroup: Partial<DataPortGroupRow> = {
      max: moduleDefinition.outputDataPortsGroup.maxAllowedPortCount,
      portIoType: moduleDefinition.outputDataPortsGroup
        .portIoType as PortIoType,
      ports: moduleDefinition.outputDataPortsGroup.staticPortDefinitions.map(
        port => ({
          dataPortId: port.dataPortId,
          name: port.dataPortName,
        }),
      ) as unknown as DataPortDefinitionRow[],
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
