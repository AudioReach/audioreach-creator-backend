// packages/infrastructure/persistence/persistence-typeorm-sqllite/entity-schema/index.ts
import type {BlobBytesConverter} from './usecase-data/module/helper/blob-unit8array.converter.js';
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
export {
  ProcessorDefinitionRow,
  ProcessorDefinitionSchema,
} from './definitions/common/processor-definition.schema.js';

// Container
export {
  ContainerTypeRow,
  ContainerTypeSchema,
} from './definitions/container/container-definition.schema.js';
export {
  ContainerPropertyRow,
  ContainerPropertyDefinitionSchema,
} from './definitions/container/container-property-definition.schema.js';

// Key-Value
export {
  KeyDefinitionRow,
  KeyDefinitionSchema,
} from './definitions/key-value/key-definition.schema.js';
export {
  ValueDefinitionRow,
  ValueDefinitionSchema,
} from './definitions/key-value/value-definition.schema.js';

// Module - Driver
export {
  DriverModuleDefinitionRow,
  DriverModuleDefinitionSchema,
} from './definitions/module/driver/driver-module-definition.schema.js';
export {
  DriverModuleParameterDefinitionRow,
  DriverModuleParameterDefinitionSchema,
} from './definitions/module/driver/driver-module-parameter-definition.schema.js';

// Module - SPF
export {
  DataPortGroupRow,
  DataPortGroupSchema,
} from './definitions/module/spf/data-group-definition.schema.js';
export {
  DataPortDefinitionRow,
  DataPortDefinitionSchema,
} from './definitions/module/spf/data-port-definition.schema.js';
export {
  DynamicIntentDefinitionRow,
  DynamicIntentDefinitionSchema,
} from './definitions/module/spf/dynamic-intent-definition.schema.js';
export {
  ModuleAttributeRow,
  ModuleAttributeSchema,
} from './definitions/module/spf/module-attribute.schema.js';
export {
  ModuleDefinitionMetaDataRow,
  ModuleDefinitionMetaDataSchema,
} from './definitions/module/spf/module-definition-meta-data.schema.js';
export {
  ModuleParameterAttributeRow,
  ModuleParameterAttributeSchema,
} from './definitions/module/spf/module-paramater-attribute.schema.js';
export {
  ModulePropertyRow,
  ModulePropertyDefinitionSchema,
} from './definitions/module/spf/module-property-definition.schema.js';
export {
  SpfModuleDefinitionRow,
  SpfModuleDefinitionSchema,
} from './definitions/module/spf/spf-module-definition.schema.js';
export {
  SpfModuleParameterDefinitionRow,
  SpfModuleParameterDefinitionSchema,
} from './definitions/module/spf/spf-module-parameter-definition.schema.js';
export {
  StaticControlPortDefinitionRow,
  StaticControlPortDefinitionSchema,
} from './definitions/module/spf/static-control-port-definition.schema.js';
export {
  StaticIntentDefinitionRow,
  StaticIntentDefinitionSchema,
} from './definitions/module/spf/static-intent-definition.schema.js';

// Subgraph
export {
  SubgraphPropertyRow,
  SubgraphPropertyDefinitionSchema,
} from './definitions/subgraph/subgraph-property-definition.schema.js';
export {
  VcpmModuleDefinitionRow,
  VcpmModuleDefinitionSchema,
} from './definitions/subgraph/vcpm/vcpm-module-definition.schema.js';
export {
  VcpmModuleParameterDefinitionRow,
  VcpmModuleParameterDefinitionSchema,
} from './definitions/subgraph/vcpm/vcpm-module-parameter-definition.schema.js';

// ===== RUNTIME DATA SCHEMAS =====
// Driver Module Data
export {
  DriverModuleRow,
  DriverModuleSchema,
  DkvRow,
  DkvSchema,
  DkvParameterPayloadRow,
  DkvParameterPayloadSchema,
} from './driver-module-data/driver-module.js';

// Module Manager
export {
  ModuleManagerDataRow,
  ModuleManagerDataSchema,
} from './module-manager/module-manager-data.js';

// Project Data
export {
  ArcDbFileRow,
  ArcDbFileSchema,
} from './project-data/arc-db-file.schema.js';
export {ProjectRow, ProjectSchema} from './project-data/project.schema.js';

// Use Case Data - Common
export {
  KeyVectorRow,
  KeyVectorSchema,
} from './usecase-data/common/key-vector-schema.js';

// Use Case Data - Container
export {
  ContainerPropertyDataRow,
  ContainerPropertyDataSchema,
} from './usecase-data/container/container-property-data.js';
export {
  ContainerRow,
  ContainerSchema,
} from './usecase-data/container/container.schema.js';

// Use Case Data - Links
export {
  ControlLinkRow,
  ControlLinkSchema,
} from './usecase-data/Links/control-link.js';
export {DataLinkRow, DataLinkSchema} from './usecase-data/Links/data-link.js';

// Use Case Data - Module
export {
  CkvRow,
  CkvSchema,
  CkvParameterPayloadRow,
  CkvParameterPayloadRowSchema,
} from './usecase-data/module/spf-module-calibration-data.schema.js';
export {
  SpfModulePropertiesDataRow,
  SpfModulePropertiesDataSchema,
} from './usecase-data/module/spf-module-properties-data.js';
export {
  ModuleTagIdMapRow,
  ModuleTagIdMapSchema,
  TkvRow,
  TkvSchema,
  TkvParameterPayloadRow,
  TkvParameterPayloadSchema,
} from './usecase-data/module/spf-module-tag-data.schema.js';
export {
  SpfModuleRow,
  SpfModuleSchema,
} from './usecase-data/module/spf-module.schema.js';

// Use Case Data - Node
export {
  ControlPortRow,
  ControlPortSchema,
  IntentRow,
  IntentSchema,
} from './usecase-data/node/control-port.js';
export {
  DataPortRow,
  DataPortSchema,
} from './usecase-data/node/data-port-info.schema.js';
export {NodeRow, NodeSchema} from './usecase-data/node/node.schema.js';

// Use Case Data - Subgraph
export {
  SubgraphPropertyDataRow,
  SubgraphPropertyDataSchema,
} from './usecase-data/subgraph/subgraph-property-data.js';
export {
  VcpmInstanceRow,
  VcpmInstanceSchema,
  VcpmCkvRow,
  VcpmCkvSchema,
  VcpmParameterPayloadRow,
  VcpmParameterPayloadSchema,
} from './usecase-data/subgraph/subgraph-vcpm-data.js';
export {
  SubgraphRow,
  SubgraphSchema,
} from './usecase-data/subgraph/subgraph.schema.js';

// Use Case Data - Subsystem
export {
  SubsystemRow,
  SubsystemSchema,
} from './usecase-data/subsystem/subsystem.js';

// Use Case Data - Main
export {
  UseCaseRow,
  UseCaseSchema,
  UseCaseCategoryRow,
  UseCaseCategorySchema,
} from './usecase-data/use-case.js';

// ===== HELPER TYPES =====
export type {BlobBytesConverter} from './usecase-data/module/helper/blob-unit8array.converter.js';

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
    SpfModuleParameterDefinitionSchema(blobConverter),
    StaticControlPortDefinitionSchema,
    StaticIntentDefinitionSchema,
    SubgraphPropertyDefinitionSchema,
    VcpmModuleDefinitionSchema,
    VcpmModuleParameterDefinitionSchema(blobConverter),

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
