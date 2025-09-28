// packages/core/src/infrastructure/database/entity-schema/index.ts
import {BlobBytesConverter} from './usecase-data/module/helper/blob-unit8array.converter.js';
import {EntitySchema} from 'typeorm';

// Import all schemas for use in getAllEntitySchemas function
import {ProcessorDefinitionSchema} from './definitions/common/processor-definition.schema.js';
import {ContainerTypeSchema} from './definitions/container/container-definition.schema.js';
import {ContainerPropertyDefinitionSchema} from './definitions/container/container-property-definition.schema.js';
import {KeyDefinitionSchema} from './definitions/key-value/key-definition.schema.js';
import {ValueDefinitionSchema} from './definitions/key-value/value-definition.schema.js';
import {DriverModuleDefinitionSchema} from './definitions/module/driver/driver-module-definition.schema.js';
import {DriverModuleParameterDefinitionSchema} from './definitions/module/driver/driver-module-parameter-definition.schema.js';
import {DataPortGroupSchema} from './definitions/module/spf/data-group-definition.schema.js';
import {DataPortDefinitionSchema} from './definitions/module/spf/data-port-definition.schema.js';
import {DynamicIntentDefinitionSchema} from './definitions/module/spf/dynamic-intent-definition.schema.js';
import {ModuleAttributeSchema} from './definitions/module/spf/module-attribute.schema.js';
import {ModuleDefinitionMetaDataSchema} from './definitions/module/spf/module-definition-meta-data.schema.js';
import {ModuleParameterAttributeSchema} from './definitions/module/spf/module-paramater-attribute.schema.js';
import {ModulePropertyDefinitionSchema} from './definitions/module/spf/module-property-definition.schema.js';
import {SpfModuleDefinitionSchema} from './definitions/module/spf/spf-module-definition.schema.js';
import {SpfModuleParameterDefinitionSchema} from './definitions/module/spf/spf-module-parameter-definition.schema.js';
import {StaticControlPortDefinitionSchema} from './definitions/module/spf/static-control-port-definition.schema.js';
import {StaticIntentDefinitionSchema} from './definitions/module/spf/static-intent-definition.schema.js';
import {SubgraphPropertyDefinitionSchema} from './definitions/subgraph/subgraph-property-definition.schema.js';
import {VcpmModuleDefinitionSchema} from './definitions/subgraph/vcpm/vcpm-module-definition.schema.js';
import {VcpmModuleParameterDefinitionSchema} from './definitions/subgraph/vcpm/vcpm-module-parameter-definition.schema.js';
import {
  DriverModuleSchema,
  DkvSchema,
  DkvParameterPayloadSchema,
} from './driver-module-data/driver-module.js';
import {ModuleManagerDataSchema} from './module-manager/module-manager-data.js';
import {ArcDbFileSchema} from './project-data/arc-db-file.schema.js';
import {ProjectSchema} from './project-data/project.schema.js';
import {KeyVectorSchema} from './usecase-data/common/key-vector-schema.js';
import {ContainerPropertyDataSchema} from './usecase-data/container/container-property-data.js';
import {ContainerSchema} from './usecase-data/container/container.schema.js';
import {ControlLinkSchema} from './usecase-data/Links/control-link.js';
import {DataLinkSchema} from './usecase-data/Links/data-link.js';
import {
  CkvSchema,
  CkvParameterPayloadRowSchema,
} from './usecase-data/module/spf-module-calibration-data.schema.js';
import {SpfModulePropertiesDataSchema} from './usecase-data/module/spf-module-properties-data.js';
import {
  ModuleTagIdMapSchema,
  TkvSchema,
  TkvParameterPayloadSchema,
} from './usecase-data/module/spf-module-tag-data.schema.js';
import {SpfModuleSchema} from './usecase-data/module/spf-module.schema.js';
import {
  ControlPortSchema,
  IntentSchema,
} from './usecase-data/node/control-port.js';
import {DataPortSchema} from './usecase-data/node/data-port-info.schema.js';
import {NodeSchema} from './usecase-data/node/node.schema.js';
import {SubgraphPropertyDataSchema} from './usecase-data/subgraph/subgraph-property-data.js';
import {
  VcpmInstanceSchema,
  VcpmCkvSchema,
  VcpmParameterPayloadSchema,
} from './usecase-data/subgraph/subgraph-vcpm-data.js';
import {SubgraphSchema} from './usecase-data/subgraph/subgraph.schema.js';
import {SubsystemSchema} from './usecase-data/subsystem/subsystem.js';
import {UseCaseSchema, UseCaseCategorySchema} from './usecase-data/use-case.js';

// ===== DEFINITION SCHEMAS =====
// Common
export {ProcessorDefinitionSchema} from './definitions/common/processor-definition.schema.js';

// Container
export {ContainerTypeSchema} from './definitions/container/container-definition.schema.js';
export {ContainerPropertyDefinitionSchema} from './definitions/container/container-property-definition.schema.js';

// Key-Value
export {KeyDefinitionSchema} from './definitions/key-value/key-definition.schema.js';
export {ValueDefinitionSchema} from './definitions/key-value/value-definition.schema.js';

// Module - Driver
export {DriverModuleDefinitionSchema} from './definitions/module/driver/driver-module-definition.schema.js';
export {DriverModuleParameterDefinitionSchema} from './definitions/module/driver/driver-module-parameter-definition.schema.js';

// Module - SPF
export {DataPortGroupSchema} from './definitions/module/spf/data-group-definition.schema.js';
export {DataPortDefinitionSchema} from './definitions/module/spf/data-port-definition.schema.js';
export {DynamicIntentDefinitionSchema} from './definitions/module/spf/dynamic-intent-definition.schema.js';
export {ModuleAttributeSchema} from './definitions/module/spf/module-attribute.schema.js';
export {ModuleDefinitionMetaDataSchema} from './definitions/module/spf/module-definition-meta-data.schema.js';
export {ModuleParameterAttributeSchema} from './definitions/module/spf/module-paramater-attribute.schema.js';
export {ModulePropertyDefinitionSchema} from './definitions/module/spf/module-property-definition.schema.js';
export {SpfModuleDefinitionSchema} from './definitions/module/spf/spf-module-definition.schema.js';
export {SpfModuleParameterDefinitionSchema} from './definitions/module/spf/spf-module-parameter-definition.schema.js';
export {StaticControlPortDefinitionSchema} from './definitions/module/spf/static-control-port-definition.schema.js';
export {StaticIntentDefinitionSchema} from './definitions/module/spf/static-intent-definition.schema.js';

// Subgraph
export {SubgraphPropertyDefinitionSchema} from './definitions/subgraph/subgraph-property-definition.schema.js';
export {VcpmModuleDefinitionSchema} from './definitions/subgraph/vcpm/vcpm-module-definition.schema.js';
export {VcpmModuleParameterDefinitionSchema} from './definitions/subgraph/vcpm/vcpm-module-parameter-definition.schema.js';

// ===== RUNTIME DATA SCHEMAS =====
// Driver Module Data
export {
  DriverModuleSchema,
  DkvSchema,
  DkvParameterPayloadSchema,
} from './driver-module-data/driver-module.js';

// Module Manager
export {ModuleManagerDataSchema} from './module-manager/module-manager-data.js';

// Project Data
export {ArcDbFileSchema} from './project-data/arc-db-file.schema.js';
export {ProjectSchema} from './project-data/project.schema.js';

// Use Case Data - Common
export {KeyVectorSchema} from './usecase-data/common/key-vector-schema.js';

// Use Case Data - Container
export {ContainerPropertyDataSchema} from './usecase-data/container/container-property-data.js';
export {ContainerSchema} from './usecase-data/container/container.schema.js';

// Use Case Data - Links
export {ControlLinkSchema} from './usecase-data/Links/control-link.js';
export {DataLinkSchema} from './usecase-data/Links/data-link.js';

// Use Case Data - Module
export {
  CkvSchema,
  CkvParameterPayloadRowSchema,
} from './usecase-data/module/spf-module-calibration-data.schema.js';
export {SpfModulePropertiesDataSchema} from './usecase-data/module/spf-module-properties-data.js';
export {
  ModuleTagIdMapSchema,
  TkvSchema,
  TkvParameterPayloadSchema,
} from './usecase-data/module/spf-module-tag-data.schema.js';
export {SpfModuleSchema} from './usecase-data/module/spf-module.schema.js';

// Use Case Data - Node
export {
  ControlPortSchema,
  IntentSchema,
} from './usecase-data/node/control-port.js';
export {DataPortSchema} from './usecase-data/node/data-port-info.schema.js';
export {NodeSchema} from './usecase-data/node/node.schema.js';

// Use Case Data - Subgraph
export {SubgraphPropertyDataSchema} from './usecase-data/subgraph/subgraph-property-data.js';
export {
  VcpmInstanceSchema,
  VcpmCkvSchema,
  VcpmParameterPayloadSchema,
} from './usecase-data/subgraph/subgraph-vcpm-data.js';
export {SubgraphSchema} from './usecase-data/subgraph/subgraph.schema.js';

// Use Case Data - Subsystem
export {SubsystemSchema} from './usecase-data/subsystem/subsystem.js';

// Use Case Data - Main
export {UseCaseSchema, UseCaseCategorySchema} from './usecase-data/use-case.js';

// ===== HELPER TYPES =====
export {BlobBytesConverter} from './usecase-data/module/helper/blob-unit8array.converter.js';

// ===== SCHEMA FACTORY HELPER =====
/**
 * Helper function to get all schemas with blob converter
 * This centralizes the blob converter logic in core package
 */
export function getAllEntitySchemas(
  blobConverter: BlobBytesConverter,
): EntitySchema[] {
  return [
    // Definition Schemas (no blob converter needed)
    ProcessorDefinitionSchema,
    ContainerTypeSchema,
    ContainerPropertyDefinitionSchema,
    KeyDefinitionSchema,
    ValueDefinitionSchema,
    DriverModuleDefinitionSchema,
    DriverModuleParameterDefinitionSchema,
    DataPortGroupSchema,
    DataPortDefinitionSchema,
    DynamicIntentDefinitionSchema,
    ModuleAttributeSchema,
    ModuleDefinitionMetaDataSchema,
    ModuleParameterAttributeSchema,
    ModulePropertyDefinitionSchema,
    SpfModuleDefinitionSchema,
    SpfModuleParameterDefinitionSchema,
    StaticControlPortDefinitionSchema,
    StaticIntentDefinitionSchema,
    SubgraphPropertyDefinitionSchema,
    VcpmModuleDefinitionSchema,
    VcpmModuleParameterDefinitionSchema,

    // Runtime Data Schemas
    DriverModuleSchema,
    DkvSchema,
    DkvParameterPayloadSchema(blobConverter), // Factory with blob converter
    ModuleManagerDataSchema,
    ArcDbFileSchema,
    ProjectSchema,
    KeyVectorSchema,
    ContainerPropertyDataSchema(blobConverter), // Factory with blob converter
    ContainerSchema,
    ControlLinkSchema,
    DataLinkSchema,
    CkvSchema(blobConverter), // Factory with blob converter
    CkvParameterPayloadRowSchema(blobConverter), // Factory with blob converter
    SpfModulePropertiesDataSchema(blobConverter), // Factory with blob converter
    ModuleTagIdMapSchema,
    TkvSchema(blobConverter), // Factory with blob converter
    TkvParameterPayloadSchema(blobConverter), // Factory with blob converter
    SpfModuleSchema,
    ControlPortSchema,
    IntentSchema,
    DataPortSchema,
    NodeSchema,
    SubgraphPropertyDataSchema(blobConverter), // Factory with blob converter
    VcpmInstanceSchema,
    VcpmCkvSchema,
    VcpmParameterPayloadSchema(blobConverter), // Factory with blob converter
    SubgraphSchema,
    SubsystemSchema,
    UseCaseSchema,
    UseCaseCategorySchema,
  ];
}
