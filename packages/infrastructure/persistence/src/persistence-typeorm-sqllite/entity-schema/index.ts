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
import {EditSessionSchema} from './edit-session/edit-session.schema.js';
import {EditActionSchema} from './edit-session/edit-action.schema.js';
import {RestorePointSchema} from './edit-session/restore-point.schema.js';
import {ProjectActivitySchema} from './edit-session/project-activity.schema.js';

// ===== DEFINITION SCHEMAS =====
// Common
export type {ProcessorDefinitionRow} from './definitions/common/processor-definition.schema.js';
export {ProcessorDefinitionSchema} from './definitions/common/processor-definition.schema.js';

/* Container */
export type {ContainerTypeRow} from './definitions/container/container-definition.schema.js';
export {ContainerTypeSchema} from './definitions/container/container-definition.schema.js';
export type {ContainerPropertyRow} from './definitions/container/container-property-definition.schema.js';
export {ContainerPropertyDefinitionSchema} from './definitions/container/container-property-definition.schema.js';

// Key-Value
export type {KeyDefinitionRow} from './definitions/key-value/key-definition.schema.js';
export {KeyDefinitionSchema} from './definitions/key-value/key-definition.schema.js';
export type {ValueDefinitionRow} from './definitions/key-value/value-definition.schema.js';
export {ValueDefinitionSchema} from './definitions/key-value/value-definition.schema.js';

// Module - Driver
export type {DriverModuleDefinitionRow} from './definitions/module/driver/driver-module-definition.schema.js';
export {DriverModuleDefinitionSchema} from './definitions/module/driver/driver-module-definition.schema.js';
export type {DriverModuleParameterDefinitionRow} from './definitions/module/driver/driver-module-parameter-definition.schema.js';
export {DriverModuleParameterDefinitionSchema} from './definitions/module/driver/driver-module-parameter-definition.schema.js';

// Module - SPF
export type {DataPortGroupRow} from './definitions/module/spf/data-group-definition.schema.js';
export {DataPortGroupSchema} from './definitions/module/spf/data-group-definition.schema.js';
export type {DataPortDefinitionRow} from './definitions/module/spf/data-port-definition.schema.js';
export {DataPortDefinitionSchema} from './definitions/module/spf/data-port-definition.schema.js';
export type {DynamicIntentDefinitionRow} from './definitions/module/spf/dynamic-intent-definition.schema.js';
export {DynamicIntentDefinitionSchema} from './definitions/module/spf/dynamic-intent-definition.schema.js';
export type {ModuleAttributeRow} from './definitions/module/spf/module-attribute.schema.js';
export {ModuleAttributeSchema} from './definitions/module/spf/module-attribute.schema.js';
export type {ModuleDefinitionMetaDataRow} from './definitions/module/spf/module-definition-meta-data.schema.js';
export {ModuleDefinitionMetaDataSchema} from './definitions/module/spf/module-definition-meta-data.schema.js';
export type {ModuleParameterAttributeRow} from './definitions/module/spf/module-paramater-attribute.schema.js';
export {ModuleParameterAttributeSchema} from './definitions/module/spf/module-paramater-attribute.schema.js';
export type {ModulePropertyRow} from './definitions/module/spf/module-property-definition.schema.js';
export {ModulePropertyDefinitionSchema} from './definitions/module/spf/module-property-definition.schema.js';
export type {SpfModuleDefinitionRow} from './definitions/module/spf/spf-module-definition.schema.js';
export {SpfModuleDefinitionSchema} from './definitions/module/spf/spf-module-definition.schema.js';
export type {SpfModuleParameterDefinitionRow} from './definitions/module/spf/spf-module-parameter-definition.schema.js';
export {SpfModuleParameterDefinitionSchema} from './definitions/module/spf/spf-module-parameter-definition.schema.js';
export type {StaticControlPortDefinitionRow} from './definitions/module/spf/static-control-port-definition.schema.js';
export {StaticControlPortDefinitionSchema} from './definitions/module/spf/static-control-port-definition.schema.js';
export type {StaticIntentDefinitionRow} from './definitions/module/spf/static-intent-definition.schema.js';
export {StaticIntentDefinitionSchema} from './definitions/module/spf/static-intent-definition.schema.js';

// Subgraph
export type {SubgraphPropertyRow} from './definitions/subgraph/subgraph-property-definition.schema.js';
export {SubgraphPropertyDefinitionSchema} from './definitions/subgraph/subgraph-property-definition.schema.js';
export type {VcpmModuleDefinitionRow} from './definitions/subgraph/vcpm/vcpm-module-definition.schema.js';
export {VcpmModuleDefinitionSchema} from './definitions/subgraph/vcpm/vcpm-module-definition.schema.js';
export type {VcpmModuleParameterDefinitionRow} from './definitions/subgraph/vcpm/vcpm-module-parameter-definition.schema.js';
export {VcpmModuleParameterDefinitionSchema} from './definitions/subgraph/vcpm/vcpm-module-parameter-definition.schema.js';

// ===== RUNTIME DATA SCHEMAS =====
// Driver Module Data
export type {
  DriverModuleRow,
  DkvRow,
  DkvParameterPayloadRow,
} from './driver-module-data/driver-module.js';
export {
  DriverModuleSchema,
  DkvSchema,
  DkvParameterPayloadSchema,
} from './driver-module-data/driver-module.js';

// Module Manager
export type {ModuleManagerDataRow} from './module-manager/module-manager-data.js';
export {ModuleManagerDataSchema} from './module-manager/module-manager-data.js';

// Project Data
export type {ArcDbFileRow} from './project-data/arc-db-file.schema.js';
export {ArcDbFileSchema} from './project-data/arc-db-file.schema.js';
export type {ProjectRow} from './project-data/project.schema.js';
export {ProjectSchema} from './project-data/project.schema.js';

// Use Case Data - Common
export type {KeyVectorRow} from './usecase-data/common/key-vector-schema.js';
export {KeyVectorSchema} from './usecase-data/common/key-vector-schema.js';

// Use Case Data - Container
export type {ContainerPropertyDataRow} from './usecase-data/container/container-property-data.js';
export {ContainerPropertyDataSchema} from './usecase-data/container/container-property-data.js';
export type {ContainerRow} from './usecase-data/container/container.schema.js';
export {ContainerSchema} from './usecase-data/container/container.schema.js';

// Use Case Data - Links
export type {ControlLinkRow} from './usecase-data/Links/control-link.js';
export {ControlLinkSchema} from './usecase-data/Links/control-link.js';
export type {DataLinkRow} from './usecase-data/Links/data-link.js';
export {DataLinkSchema} from './usecase-data/Links/data-link.js';

// Use Case Data - Module
export type {
  CkvRow,
  CkvParameterPayloadRow,
} from './usecase-data/module/spf-module-calibration-data.schema.js';
export {
  CkvSchema,
  CkvParameterPayloadRowSchema,
} from './usecase-data/module/spf-module-calibration-data.schema.js';
export type {SpfModulePropertiesDataRow} from './usecase-data/module/spf-module-properties-data.js';
export {SpfModulePropertiesDataSchema} from './usecase-data/module/spf-module-properties-data.js';
export type {
  ModuleTagIdMapRow,
  TkvRow,
  TkvParameterPayloadRow,
} from './usecase-data/module/spf-module-tag-data.schema.js';
export {
  ModuleTagIdMapSchema,
  TkvSchema,
  TkvParameterPayloadSchema,
} from './usecase-data/module/spf-module-tag-data.schema.js';
export type {SpfModuleRow} from './usecase-data/module/spf-module.schema.js';
export {SpfModuleSchema} from './usecase-data/module/spf-module.schema.js';

// Use Case Data - Node
export type {
  ControlPortRow,
  IntentRow,
} from './usecase-data/node/control-port.js';
export {
  ControlPortSchema,
  IntentSchema,
} from './usecase-data/node/control-port.js';
export type {DataPortRow} from './usecase-data/node/data-port-info.schema.js';
export {DataPortSchema} from './usecase-data/node/data-port-info.schema.js';
export type {NodeRow} from './usecase-data/node/node.schema.js';
export {NodeSchema} from './usecase-data/node/node.schema.js';

// Use Case Data - Subgraph
export type {SubgraphPropertyDataRow} from './usecase-data/subgraph/subgraph-property-data.js';
export {SubgraphPropertyDataSchema} from './usecase-data/subgraph/subgraph-property-data.js';
export type {
  VcpmInstanceRow,
  VcpmCkvRow,
  VcpmParameterPayloadRow,
} from './usecase-data/subgraph/subgraph-vcpm-data.js';
export {
  VcpmInstanceSchema,
  VcpmCkvSchema,
  VcpmParameterPayloadSchema,
} from './usecase-data/subgraph/subgraph-vcpm-data.js';
export type {SubgraphRow} from './usecase-data/subgraph/subgraph.schema.js';
export {SubgraphSchema} from './usecase-data/subgraph/subgraph.schema.js';

// Use Case Data - Subsystem
export type {SubsystemRow} from './usecase-data/subsystem/subsystem.js';
export {SubsystemSchema} from './usecase-data/subsystem/subsystem.js';

// Use Case Data - Main
export type {UseCaseRow, UseCaseCategoryRow} from './usecase-data/use-case.js';
export {UseCaseSchema, UseCaseCategorySchema} from './usecase-data/use-case.js';

// ===== EDIT SESSION SCHEMAS =====
export {EDIT_STATUS} from './edit-session/edit-session.schema.js';
export type {
  EditStatus,
  EditSessionRow,
} from './edit-session/edit-session.schema.js';
export {EditSessionSchema} from './edit-session/edit-session.schema.js';
export {
  EDIT_OPERATION,
  CHANGE_STATUS,
} from './edit-session/edit-action.schema.js';
export type {
  EditOperation,
  ChangeStatus,
  EditActionRow,
} from './edit-session/edit-action.schema.js';
export {EditActionSchema} from './edit-session/edit-action.schema.js';
export {RESTORE_TYPE} from './edit-session/restore-point.schema.js';
export type {
  RestoreType,
  RestorePointRow,
} from './edit-session/restore-point.schema.js';
export {RestorePointSchema} from './edit-session/restore-point.schema.js';
export {PROJECT_ACTIVITY_TYPE} from './edit-session/project-activity.schema.js';
export type {
  ProjectActivityType,
  ProjectActivityRow,
} from './edit-session/project-activity.schema.js';
export {ProjectActivitySchema} from './edit-session/project-activity.schema.js';

// ===== HELPER TYPES =====
export type {BlobBytesConverter} from './usecase-data/module/helper/blob-unit8array.converter.js';
export type {EntityBaseRow, EntityRowForInsert} from './entity-base.js';

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

    // Edit Session Schemas
    EditSessionSchema,
    EditActionSchema,
    RestorePointSchema,
    ProjectActivitySchema,
  ];
}
