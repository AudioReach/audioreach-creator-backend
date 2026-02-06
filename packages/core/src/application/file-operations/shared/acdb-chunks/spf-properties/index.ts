/**
 * SPF Properties - Signal Processing Framework property parsing and data structures
 *
 * This module provides TypeScript implementations for parsing SPF
 * properties from binary data
 */

// Main SPF Properties class
export {SpfProperties} from './spf-properties.js';

// Individual property classes
export {SubgraphConfigProperty} from './subgraph-config-property.js';
export {ContainerConfigProperty} from './container-config-property.js';
export {ModuleListProperty} from './module-list-property.js';
export {ModulePortProperty} from './module-port-property.js';
export {ModulePropertyConfigImpl} from './module-property-config-impl.js';
export {DataLinksProperty} from './data-links-property.js';
export {ControlLinksProperty} from './control-links-property.js';
export {VcpmConfigProperty} from './vcpm-config-property.js';

// Type definitions
export type {
  SubgraphProperty,
  ContainerProperty,
  ModuleInstance,
  ModuleInstanceInfo,
  ModuleProperty,
  ModulePropertyConfig,
  DataLink,
  ControlLink,
  PortInfo,
  HeapInfo,
} from './types.js';
