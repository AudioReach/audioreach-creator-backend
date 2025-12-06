import type {SpfModule, DataPort, ControlPort} from '@arc/core';
import type {
  SpfModuleRow,
  NodeRow,
  DataPortRow,
  ControlPortRow,
} from '../../../entity-schema/index.js';
import {NodeType} from '../../../entity-schema/usecase-data/node/node.schema.js';
import {PortIoType} from '../../../entity-schema/definitions/module/spf/port-io-type-definition.schema.js';

// Type aliases for database insertion rows (excluding auto-generated fields)
type DataPortRowInsert = Omit<
  DataPortRow,
  'systemId' | 'creationDate' | 'updateDate' | 'node'
>;
type ControlPortRowInsert = Omit<
  ControlPortRow,
  'systemId' | 'creationDate' | 'updateDate' | 'node'
>;

/**
 * Maps SpfModule domain entity to SpfModuleRow for database insertion.
 * Uses type assertion for missing audit fields (creationDate, updateDate) as they will be handled by the database.
 *
 * @param spfModule - SpfModule domain entity
 * @returns SpfModuleRow ready for batch insertion
 */
export function mapSpfModuleToRow(spfModule: SpfModule): SpfModuleRow {
  return {
    instanceId: spfModule.instanceId,
    alias: spfModule.alias || '',
    subgraphSystemId: spfModule.subgraphSystemId,
    containerSystemId: spfModule.containerSystemId,
    definitionSystemId: spfModule.definitionSystemId,
    fileSystemId: spfModule.fileSystemId,
  } as SpfModuleRow;
}

/**
 * Maps SpfModule domain entity to NodeRow for database insertion.
 * Node shares the same systemId as SpfModule (shared primary key relationship).
 *
 * @param spfModule - SpfModule domain entity
 * @returns NodeRow ready for batch insertion
 */
export function mapNodeToRow(spfModule: SpfModule): NodeRow {
  return {
    parentId: spfModule.parentId,
    type: NodeType.Module,
    fileSystemId: spfModule.fileSystemId,
  } as NodeRow;
}

/**
 * Maps DataPort domain entities to DataPortRow array for database insertion.
 * Uses dataPortId as natural key for reliable systemId mapping.
 *
 * @param dataPorts - Array of DataPort domain entities
 * @param nodeSystemId - SystemId of the parent Node
 * @returns Array of DataPortRow ready for batch insertion
 */
export function mapDataPortsToRows(
  dataPorts: readonly DataPort[],
  nodeSystemId: number,
): DataPortRowInsert[] {
  return dataPorts.map(port => ({
    dataPortId: port.dataPortId,
    name: port.name,
    portIoType: port.portIoType as PortIoType, // Type assertion to schema PortIoType enum
    isStatic: port.isStatic,
    nodeSystemId: nodeSystemId,
  })) as DataPortRowInsert[];
}

/**
 * Maps ControlPort domain entities to ControlPortRow array for database insertion.
 * Uses portId as natural key for reliable systemId mapping.
 * Note: Intent insertion is skipped as per task requirements.
 *
 * @param controlPorts - Array of ControlPort domain entities
 * @param nodeSystemId - SystemId of the parent Node
 * @returns Array of ControlPortRow ready for batch insertion
 */
export function mapControlPortsToRows(
  controlPorts: readonly ControlPort[],
  nodeSystemId: number,
): ControlPortRowInsert[] {
  return controlPorts.map(port => ({
    portId: port.portId,
    name: port.name,
    isStatic: port.isStatic,
    nodeSystemId: nodeSystemId,
  })) as ControlPortRowInsert[];
}
