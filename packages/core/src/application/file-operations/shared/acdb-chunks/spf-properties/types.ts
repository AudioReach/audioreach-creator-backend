/**
 * TypeScript interfaces for SPF Properties data structures
 * Simplified from C# implementations for better TypeScript usage
 */

/**
 * Represents a single subgraph property configuration
 */
export interface SubgraphProperty {
  /** Subgraph ID */
  subgraphId: number;
  /** Map of property ID to property data */
  properties: Map<number, Uint8Array>;
}

/**
 * Represents a single container property configuration
 */
export interface ContainerProperty {
  /** Container instance ID */
  containerId: number;
  /** Map of property ID to property data */
  properties: Map<number, Uint8Array>;
}

/**
 * Represents a module instance
 */
export interface ModuleInstance {
  /** Module ID */
  moduleId: number;
  /** Instance ID */
  instanceId: number;
}

/**
 * Represents module instance information for a subgraph/container pair
 */
export interface ModuleInstanceInfo {
  /** Subgraph ID */
  subgraphId: number;
  /** Container ID */
  containerId: number;
  /** List of module instances */
  moduleInstances: ModuleInstance[];
}

/**
 * Represents a module property (port info, heap ID, etc.)
 */
export interface ModuleProperty {
  /** Property ID */
  propertyId: number;
  /** Property data */
  data: Uint8Array;
}

/**
 * Represents module properties for a specific module instance
 */
export interface ModulePropertyConfig {
  /** Module instance ID */
  moduleInstanceId: number;
  /** List of properties for this module */
  properties: ModuleProperty[];
}

/**
 * Represents a data link between two module instances
 */
export interface DataLink {
  /** Source module instance ID */
  sourceInstanceId: number;
  /** Source port ID */
  sourcePortId: number;
  /** Destination module instance ID */
  destinationInstanceId: number;
  /** Destination port ID */
  destinationPortId: number;
}

/**
 * Represents a control link between two module instances
 */
export interface ControlLink {
  /** Peer 1 module instance ID */
  peer1InstanceId: number;
  /** Peer 1 port ID */
  peer1PortId: number;
  /** Peer 2 module instance ID */
  peer2InstanceId: number;
  /** Peer 2 port ID */
  peer2PortId: number;
  /** Map of property ID to property data */
  properties: Map<number, Uint8Array>;
}

/**
 * Represents port information for a module
 */
export interface PortInfo {
  /** Maximum input ports */
  maxInputPorts: number;
  /** Maximum output ports */
  maxOutputPorts: number;
}

/**
 * Represents heap ID information for a module
 */
export interface HeapInfo {
  /** Heap ID value */
  heapId: number;
}
