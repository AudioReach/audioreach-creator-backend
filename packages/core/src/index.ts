// CQRS Orchestration exports
export * from './application/orchestration/command-bus.js';
export * from './application/orchestration/query-bus.js';
export * from './application/orchestration/cqrs/commands/command.js';
export * from './application/orchestration/cqrs/commands/command-handler.js';
export * from './application/orchestration/cqrs/queries/query.js';
export * from './application/orchestration/cqrs/queries/query-handler.js';
export * from './application/orchestration/cqrs/request.js';
export * from './application/orchestration/cqrs/registries/command-handler-registry.js';
export * from './application/orchestration/cqrs/registries/query-handler-registry.js';
export * from './application/orchestration/cqrs/exceptions/handler-not-found-exception.js';
// Session context types and errors (§8.1 and §7a.4 of foundation.md)
export * from './application/orchestration/cqrs/active-session.js';
export * from './application/orchestration/cqrs/write-context.js';
export * from './application/orchestration/cqrs/errors.js';
// Session lifecycle commands and result type (LLD1 §7b)
export {StartSessionCommand} from './application/edit-session/start-session/start-session.command.js';
export {EndSessionCommand} from './application/edit-session/end-session/end-session.command.js';
export type {SessionResult} from './application/edit-session/session-types.js';

// Shared errors
export * from './shared/errors/index.js';

// Shared utilities and base classes
export * from './application/shared/base-command.js';
export * from './application/shared/base-query.js';
export * from './application/ports/persistence/unit-of-work.js';
export * from './application/ports/persistence/unit-of-work-factory.js';
export * from './application/ports/persistence/repositories/bulk-import/bulk-insert-result-types.js';
export * from './application/ports/persistence/repositories/bulk-import/bulk-import.repository.js';
export * from './application/ports/persistence/repositories/project/project.repository.js';
export * from './shared/utilities/uuid.js';
export * from './shared/utilities/binary-utils.js';
export * from './shared/utilities/array-utils.js';
export * from './shared/utilities/projection.js';
export * from './shared/types/logger.interface.js';
export * from './shared/types/json-types.js';
export * from './shared/types/branded-ids.js';
export * from './domain/entities/definitions/common/types/param-type.js';
export * from './domain/entities/definitions/common/types/major-module-type.js';
export * from './domain/entities/definitions/common/types/build-type.js';
export * from './domain/entities/definitions/common/types/mdf-module-type.js';
// New Result<T> discriminated union + namespace (design §3, FR-2, FR-3).
export * from './application/shared/result/result.js';

// Shared Change Types
export * from './application/shared/change-vocabulary.js';
export * from './application/shared/read-model-base.js';
// Write handler shared result type
export * from './application/shared/write-result.js';
// Shared write-response summary schemas
export {
  EntityIdCollectionSchema,
  ComponentChangeSummarySchema,
} from './application/shared/dto/component-change-summary-dto.js';
export type {
  EntityIdCollection,
  ComponentChangeSummary,
} from './application/shared/dto/component-change-summary-dto.js';
export type {EditOptions} from './application/ports/persistence/edit-options.js';

// Module write path — port interfaces (LLD2 PATCH + AddModule)
export type {
  ModuleRepository,
  ExistingPayloadRow,
  CkvPayloadUpdate,
} from './application/ports/persistence/repositories/module/module.repository.js';
export type {ContainerRepository} from './application/ports/persistence/repositories/container/container.repository.js';
export type {
  ModuleDefinitionRepository,
  ParameterDefinitionBase,
} from './application/ports/persistence/repositories/module/module-definition.repository.js';
export type {DataLinkRepository} from './application/ports/persistence/repositories/data-link/data-link.repository.js';
export type {ControlLinkRepository} from './application/ports/persistence/repositories/control-link/control-link.repository.js';
export type {SubgraphRepository} from './application/ports/persistence/repositories/subgraph/subgraph.repository.js';
export type {SubsystemRepository} from './application/ports/persistence/repositories/subsystem/subsystem.repository.js';
export type {
  PropertyDefinitionsRepository,
  SubgraphPropertyDefinitionRecord,
  ContainerPropertyDefinitionRecord,
} from './application/ports/persistence/repositories/property-definitions/property-definitions.repository.js';
// Module write path — commands (LLD2)
export {PatchSpfModuleCommand} from './application/usecase-designer/spf-module/patch/patch-spf-module.command.js';
export {CreateModuleCommand} from './application/usecase-designer/spf-module/create-module/create-module.command.js';
export {DeleteSpfModuleResultSchema} from './application/usecase-designer/spf-module/dto/delete-spf-module-result.schema.js';
export type {DeleteSpfModuleResult} from './application/usecase-designer/spf-module/dto/delete-spf-module-result.schema.js';

// Application services
export * from './application/ports/persistence/query-services/query-services.js';
export * from './application/ports/persistence/query-services/module/module-query-service.js';
export * from './application/ports/persistence/query-services/module/query-models/module-compact.js';
export * from './application/ports/persistence/query-services/usecase/usecase-query-service.js';
export * from './application/ports/persistence/query-services/usecase/query-models/key-vector-read-model.js';
export * from './application/ports/persistence/query-services/usecase/query-models/usecase-read-model.js';
export * from './application/ports/persistence/query-services/spf-module/ports/data-port-read-model.js';
export * from './application/ports/persistence/query-services/spf-module/ports/control-port-read-model.js';
export * from './application/ports/persistence/query-services/spf-module/ports/intent-read-model.js';
export * from './application/ports/persistence/query-services/subgraph/subgraph-read-model.js';
export * from './application/ports/persistence/query-services/project/project-query-service.js';

// Link query services
export * from './application/ports/persistence/query-services/link/data-link-read-model.js';
export * from './application/ports/persistence/query-services/link/control-link-read-model.js';
export * from './application/ports/persistence/query-services/link/data-link-query-service.js';
export * from './application/ports/persistence/query-services/link/control-link-query-service.js';

// Subsystem query service + read model
export * from './application/ports/persistence/query-services/subsystem/subsystem-query-service.js';
export * from './application/ports/persistence/query-services/subsystem/subsystem-read-model.js';
export * from './application/ports/persistence/query-services/usecase/query-models/components-read-model.js';
export * from './application/usecase-designer/usecase/get-component-with-subsystem/components-with-subsystems-read-model.js';

// Filter expression (shared filter AST — no framework deps)
export * from './shared/filter/index.js';
export type {ParameterPayloadReadModel} from './application/ports/persistence/query-services/spf-module/ckv/ckv-read-model.js';
export * from './application/ports/persistence/query-services/spf-module/ckv/ckv-query-service.js';

// SPF module query services and read models
export * from './application/ports/persistence/query-services/spf-module/spf-module-query-service.js';
export * from './application/ports/persistence/query-services/spf-module/spf-module-read-model.js';
export * from './application/ports/persistence/query-services/node/node-query-service.js';
export * from './application/ports/persistence/query-services/spf-module/tuning/tuning-config-read-model.js';
export * from './application/ports/persistence/query-services/spf-module/tuning/spf-tuning-config-service.js';
export * from './application/ports/persistence/query-services/spf-module-definition/spf-module-definition-query-service.js';
export * from './application/ports/persistence/query-services/spf-module-definition/spf-module-definition-read-model.js';
export * from './application/ports/persistence/query-services/shared/parameter-definition-read-model.js';
export * from './application/ports/persistence/query-services/spf-module-definition/custom-module-metadata-read-model.js';
export * from './application/ports/persistence/query-services/shared/module-definition-summary-read-model.js';
export * from './application/ports/persistence/query-services/driver-module-definition/driver-module-definition-query-service.js';
export * from './application/ports/persistence/query-services/configuration-includes.js';
export * from './application/ports/persistence/query-services/key-value/key-value-definition-read-model.js';
export * from './application/ports/persistence/query-services/key-value/key-value-definition-projections.js';
export * from './application/ports/persistence/query-services/key-value/key-value-definition-query-service.js';
export * from './application/ports/persistence/query-services/container/container-query-service.js';
export * from './application/ports/persistence/query-services/container/container-read-model.js';
export * from './application/ports/persistence/query-services/subgraph/subgraph-query-service.js';
export * from './application/ports/persistence/query-services/shared/property-payload-read-model.js';
export * from './application/ports/persistence/query-services/container-property-definition/container-property-definition-with-elements-read-model.js';
export * from './application/ports/persistence/query-services/subgraph-property-definition/subgraph-property-definition-with-elements-read-model.js';
export * from './application/ports/persistence/query-services/tag-definition/tag-definition-read-model.js';
export * from './application/ports/persistence/query-services/tag-definition/tag-definition-query-service.js';
export * from './application/ports/persistence/query-services/property-definition/property-definition-read-model.js';
export * from './application/ports/persistence/query-services/container-property-definition/container-property-def-query-service.js';
export * from './application/ports/persistence/query-services/subgraph-property-definition/subgraph-property-definition-read-model.js';
export * from './application/ports/persistence/query-services/subgraph-property-definition/subgraph-property-def-query-service.js';
export * from './application/usecase-designer/shared/property-definition-with-elements.js';
export * from './application/ports/persistence/query-services/logging/log-entry-read-model.js';
export * from './application/ports/persistence/query-services/logging/log-query-service.js';
export * from './application/logging/get-logs/get-logs-by-project.query.js';
export * from './application/logging/get-logs/get-logs-by-project.handler.js';

// Key definition query handlers
export * from './application/definition/key-definition/get-all/get-all-key-definitions.query.js';
export * from './application/definition/key-definition/get-all/get-all-key-definitions.handler.js';
export * from './application/definition/key-definition/get-key/get-key-definition.query.js';
export * from './application/definition/key-definition/get-key/get-key-definition.handler.js';
export {
  KeyDefinitionDtoSchema,
  ValueDefinitionDtoSchema,
} from './application/definition/key-definition/dto/key-definition-dto.js';
export type {
  KeyDefinitionDto,
  ValueDefinitionDto,
} from './application/definition/key-definition/dto/key-definition-dto.js';

// Tag definition query handlers
export * from './application/definition/tag-definition/get-all/get-all-tag-definitions.query.js';
export * from './application/definition/tag-definition/get-all/get-all-tag-definitions.handler.js';
export * from './application/definition/tag-definition/get-tag/get-tag-definition.query.js';
export * from './application/definition/tag-definition/get-tag/get-tag-definition.handler.js';
export {
  TagDefinitionDtoSchema,
  TagKeyDefinitionDtoSchema,
  TagValueDefinitionDtoSchema,
} from './application/definition/tag-definition/dto/tag-definition-dto.js';
export type {TagDefinitionDto} from './application/definition/tag-definition/dto/tag-definition-dto.js';

// Container property definition query handlers
export * from './application/definition/container-property-definition/get-all/get-all-container-property-definitions.query.js';
export * from './application/definition/container-property-definition/get-all/get-all-container-property-definitions.handler.js';
export * from './application/definition/container-property-definition/get-property/get-container-property-definition.query.js';
export * from './application/definition/container-property-definition/get-property/get-container-property-definition.handler.js';
export {
  ContainerPropertyDefinitionSummaryDtoSchema,
  ContainerPropertyDefinitionDtoSchema,
  mapContainerPropertyDefinitionSummary,
  mapContainerPropertyDefinition,
} from './application/definition/container-property-definition/dto/container-property-definition-dto.js';
export type {
  ContainerPropertyDefinitionSummaryDto,
  ContainerPropertyDefinitionDto,
} from './application/definition/container-property-definition/dto/container-property-definition-dto.js';

// Subgraph property definition query handlers
export * from './application/definition/subgraph-property-definition/get-all/get-all-subgraph-property-definitions.query.js';
export * from './application/definition/subgraph-property-definition/get-all/get-all-subgraph-property-definitions.handler.js';
export * from './application/definition/subgraph-property-definition/get-property/get-subgraph-property-definition.query.js';
export * from './application/definition/subgraph-property-definition/get-property/get-subgraph-property-definition.handler.js';
export {
  SubgraphPropertyDefinitionSummaryDtoSchema,
  SubgraphPropertyDefinitionDtoSchema,
  mapSubgraphPropertyDefinitionSummary,
  mapSubgraphPropertyDefinition,
} from './application/definition/subgraph-property-definition/dto/subgraph-property-definition-dto.js';
export type {
  SubgraphPropertyDefinitionSummaryDto,
  SubgraphPropertyDefinitionDto,
} from './application/definition/subgraph-property-definition/dto/subgraph-property-definition-dto.js';

// SPF module query handlers
export * from './application/usecase-designer/spf-module/query/query-spf-modules.query.js';
export * from './application/usecase-designer/spf-module/query/query-spf-modules.handler.js';
export {
  SpfModuleDtoSchema,
  CkvDtoSchema,
  TkvDtoSchema,
  TagInfoDtoSchema,
  DataPortDtoSchema,
  ControlPortDtoSchema,
  KeyValueInfoDtoSchema,
  KeyInfoDtoSchema,
  ValueInfoDtoSchema,
  KeyValuePairsInfoDtoSchema,
  SubsystemFilteredKeyValuePairsInfoDtoSchema,
  ParamInfoDtoSchema,
} from './application/usecase-designer/spf-module/query/spf-module-dto.js';
export type {
  SpfModuleDto,
  CkvDto,
  TkvDto,
  TagInfoDto,
  DataPortDto,
  ControlPortDto,
  KeyValueInfoDto,
  KeyInfoDto,
  ValueInfoDto,
  KeyValuePairsInfoDto,
  SubsystemFilteredKeyValuePairsInfoDto,
  ParamInfoDto,
} from './application/usecase-designer/spf-module/query/spf-module-dto.js';

// Shared element-data schemas
export {
  ELEMENT_TYPE,
  DATA_TYPE,
  ELEMENT_POLICY,
  ALLOWED_VALUES_ITEM_TYPE,
} from './shared/dto/element-data/element-types.js';
export type {
  ElementType,
  DataType,
  ElementPolicy,
  AllowedValuesItemType,
} from './shared/dto/element-data/element-types.js';
// Note: DISPLAY_TYPE / DisplayType intentionally omitted — param-parser exports a different DISPLAY_TYPE variant
export {NameValuePairDtoSchema} from './shared/dto/element-data/name-value-pair-dto.js';
export type {NameValuePairDto} from './shared/dto/element-data/name-value-pair-dto.js';
export {BitFieldDtoSchema} from './shared/dto/element-data/bit-field-dto.js';
export type {BitFieldDto} from './shared/dto/element-data/bit-field-dto.js';
export {ConfigElementDtoSchema} from './shared/dto/element-data/config-element-dto.js';
export type {ConfigElementDto} from './shared/dto/element-data/config-element-dto.js';
export {
  ElementUnionSchema,
  ElementTemplateArrayDtoSchema,
  StructDtoSchema,
} from './shared/dto/element-data/element-union.js';
export type {
  ElementUnion,
  ElementTemplateArrayDto,
  StructDto,
} from './shared/dto/element-data/element-union.js';
export {PropertyDtoSchema} from './shared/dto/property-dto.js';
export type {PropertyDto} from './shared/dto/property-dto.js';

// Container query handlers
export * from './application/usecase-designer/container/query/query-containers.query.js';
export * from './application/usecase-designer/container/query/query-containers.handler.js';
export {ContainerDtoSchema} from './application/usecase-designer/container/dto/container-dto.js';
export type {ContainerDto} from './application/usecase-designer/container/dto/container-dto.js';

// SPF module definition query handlers
export * from './application/definition/spf-module-definition/get-all/get-all-spf-module-definitions.query.js';
export * from './application/definition/spf-module-definition/get-all/get-all-spf-module-definitions.handler.js';
export * from './application/definition/spf-module-definition/get-by-id/get-spf-module-definition.query.js';
export * from './application/definition/spf-module-definition/get-by-id/get-spf-module-definition.handler.js';
export * from './application/definition/spf-module-definition/get-custom-module-metadata/get-spf-custom-module-metadata.query.js';
export * from './application/definition/spf-module-definition/get-custom-module-metadata/get-spf-custom-module-metadata.handler.js';
export {
  CustomModuleMetadataDtoSchema,
  mapCustomModuleMetadata,
} from './application/definition/spf-module-definition/get-custom-module-metadata/custom-module-metadata-dto.js';
export type {CustomModuleMetadataDto} from './application/definition/spf-module-definition/get-custom-module-metadata/custom-module-metadata-dto.js';
export {
  SpfModuleDefinitionDtoSchema,
  NameValueDtoSchema,
  SpfCustomModuleMetadataDtoSchema,
  DataTypeDtoSchema,
  mapSpfModuleDefinition,
} from './application/definition/spf-module-definition/dto/spf-module-definition-dto.js';
export type {SpfModuleDefinitionDto} from './application/definition/spf-module-definition/dto/spf-module-definition-dto.js';
export * from './application/definition/driver-module-definition/get-all/get-all-driver-module-definitions.query.js';
export * from './application/definition/driver-module-definition/get-all/get-all-driver-module-definitions.handler.js';
export * from './application/definition/driver-module-definition/get-by-id/get-driver-module-definition.query.js';
export * from './application/definition/driver-module-definition/get-by-id/get-driver-module-definition.handler.js';
export {
  DriverModuleDefinitionDtoSchema,
  mapDriverModuleDefinition,
} from './application/definition/driver-module-definition/dto/driver-module-definition-dto.js';
export type {DriverModuleDefinitionDto} from './application/definition/driver-module-definition/dto/driver-module-definition-dto.js';

// Use case designer
export * from './application/usecase-designer/shared/index.js';
export * from './application/usecase-designer/spf-module/get-cal-data/ckv-calibration-read-model.js';
export * from './application/usecase-designer/spf-module/get-cal-data/get-ckv-cal-data.query.js';
export * from './application/usecase-designer/spf-module/get-cal-data/get-ckv-cal-data.handler.js';
export {CkvCalDataDtoSchema} from './application/usecase-designer/spf-module/get-cal-data/ckv-cal-data-dto.js';
export type {CkvCalDataDto} from './application/usecase-designer/spf-module/get-cal-data/ckv-cal-data-dto.js';
export {TkvCalDataDtoSchema} from './application/usecase-designer/spf-module/get-tag-data/tkv-cal-data-dto.js';
export type {TkvCalDataDto} from './application/usecase-designer/spf-module/get-tag-data/tkv-cal-data-dto.js';
export {ParameterDtoSchema} from './application/usecase-designer/spf-module/dto/parameter-dto.js';
export type {ParameterDto} from './application/usecase-designer/spf-module/dto/parameter-dto.js';
export {ParameterSummaryDtoSchema} from './application/usecase-designer/spf-module/dto/parameter-dto.js';
export type {ParameterSummaryDto} from './application/usecase-designer/spf-module/dto/parameter-dto.js';
export {PropertySummaryDtoSchema} from './application/usecase-designer/spf-module/dto/parameter-dto.js';
export type {PropertySummaryDto} from './application/usecase-designer/spf-module/dto/parameter-dto.js';
export {
  ParameterElementDtoSchema,
  ConfigElementSchema,
  ElementTemplateArraySchema,
  StructSchema,
  mapConfigElement,
  mapElements,
  mapElement,
  mapElementArray,
  mapStruct,
  ConfigElementSummaryDtoSchema,
  ElementTemplateArraySummaryDtoSchema,
  StructSummaryDtoSchema,
  ParameterElementSummaryDtoSchema,
} from './application/usecase-designer/spf-module/dto/element-dto.js';
export type {ParameterElementDto} from './application/usecase-designer/spf-module/dto/element-dto.js';
export type {
  ConfigElementSummaryDto,
  ElementTemplateArraySummaryDto,
  StructSummaryDto,
  ParameterElementSummaryDto,
} from './application/usecase-designer/spf-module/dto/element-dto.js';
export * from './application/usecase-designer/spf-module/put-cal-data/put-ckv-cal-data.command.js';
export * from './application/usecase-designer/spf-module/put-cal-data/put-ckv-cal-data-result.js';
export * from './application/usecase-designer/spf-module/get/get-module-compact.query.js';
export * from './application/usecase-designer/spf-module/get/get-module-compact.handler.js';
export * from './application/usecase-designer/usecase/get-all/index.js';
export * from './application/usecase-designer/usecase/get-components/index.js';
export * from './application/usecase-designer/usecase/get-component-with-subsystem/get-components-with-subsystems.query.js';
export * from './application/usecase-designer/usecase/get-component-with-subsystem/get-components-with-subsystems.handler.js';
export * from './application/usecase-designer/subgraph/get-properties/get-subgraph-properties.query.js';
export * from './application/usecase-designer/subgraph/get-properties/get-subgraph-properties.handler.js';
export {SubgraphPropertiesDtoSchema} from './application/usecase-designer/subgraph/dto/subgraph-properties-dto.js';
export type {SubgraphPropertiesDto} from './application/usecase-designer/subgraph/dto/subgraph-properties-dto.js';
export {SubgraphDtoSchema} from './application/usecase-designer/subgraph/dto/subgraph-dto.js';
export type {SubgraphDto} from './application/usecase-designer/subgraph/dto/subgraph-dto.js';
export {
  SubgraphPairDtoSchema,
  DataLinkWithUsecasesDtoSchema,
  ControlLinkWithUsecasesDtoSchema,
} from './application/usecase-designer/subgraph/dto/subgraph-pair-dto.js';
export type {
  SubgraphPairDto,
  DataLinkWithUsecasesDto,
  ControlLinkWithUsecasesDto,
} from './application/usecase-designer/subgraph/dto/subgraph-pair-dto.js';
// Subgraph write result types
export {
  ScenarioChangeDtoSchema,
  VsidUpdateDtoSchema,
  VcpmCkvDtoSchema,
  CreateVcpmCkvDtoSchema,
} from './application/usecase-designer/subgraph/dto/subgraph-write-result-types.js';
export type {
  ScenarioChangeDto,
  VsidUpdateDto,
  VcpmCkvDto,
  CreateVcpmCkvDto,
} from './application/usecase-designer/subgraph/dto/subgraph-write-result-types.js';
// VCPM query types
export {GetVcpmCkvQuery} from './application/usecase-designer/subgraph/get-vcpm-ckv/get-vcpm-ckv.query.js';
export {GetVcpmCalDataQuery} from './application/usecase-designer/subgraph/get-vcpm-cal-data/get-vcpm-cal-data.query.js';
// Subgraph write commands
export {UpdateSubgraphScenarioCommand} from './application/usecase-designer/subgraph/update-scenario/update-subgraph-scenario.command.js';
export {UpdateSubgraphVsidCommand} from './application/usecase-designer/subgraph/update-vsid/update-subgraph-vsid.command.js';
export {PatchSubgraphCommand} from './application/usecase-designer/subgraph/patch/patch-subgraph.command.js';
export {UpdateSubgraphPropertyCommand} from './application/usecase-designer/subgraph/update-property/update-subgraph-property.command.js';
export {UpdateSubgraphContainerIdCommand} from './application/usecase-designer/subgraph/update-container-id/update-subgraph-container-id.command.js';
export {CreateVcpmCkvCommand} from './application/usecase-designer/subgraph/create-vcpm-ckv/create-vcpm-ckv.command.js';
export type {CkvKeyValuePair} from './application/usecase-designer/subgraph/create-vcpm-ckv/create-vcpm-ckv.command.js';
export {DeleteVcpmCkvCommand} from './application/usecase-designer/subgraph/delete-vcpm-ckv/delete-vcpm-ckv.command.js';
export {UpdateVcpmCalDataCommand} from './application/usecase-designer/subgraph/update-vcpm-cal-data/update-vcpm-cal-data.command.js';
// Container write commands
export {UpdateContainerPropertyCommand} from './application/usecase-designer/container/update-property/update-container-property.command.js';
export * from './application/usecase-designer/container/get-properties/get-container-properties.query.js';
export * from './application/usecase-designer/container/get-properties/get-container-properties.handler.js';
export {ContainerPropertiesDtoSchema} from './application/usecase-designer/container/dto/container-properties-dto.js';
export type {ContainerPropertiesDto} from './application/usecase-designer/container/dto/container-properties-dto.js';
export {SubsystemDtoSchema} from './application/usecase-designer/subsystem/dto/subsystem-dto.js';
export type {SubsystemDto} from './application/usecase-designer/subsystem/dto/subsystem-dto.js';
export {SubsystemSnapshotDtoSchema} from './application/usecase-designer/subsystem/dto/subsystem-snapshot.dto.js';
export type {SubsystemSnapshotDto} from './application/usecase-designer/subsystem/dto/subsystem-snapshot.dto.js';
export {MoveSubsystemComponentsDtoSchema} from './application/usecase-designer/subsystem/dto/move-subsystem-components-dto.js';
export type {MoveSubsystemComponentsDto} from './application/usecase-designer/subsystem/dto/move-subsystem-components-dto.js';
export {SubsystemFilteredKeysDtoSchema} from './application/usecase-designer/subsystem/dto/subsystem-filtered-keys.dto.js';
export type {SubsystemFilteredKeysDto} from './application/usecase-designer/subsystem/dto/subsystem-filtered-keys.dto.js';
export {UseCaseDtoSchema} from './application/usecase-designer/usecase/dto/usecase-dto.js';
export type {UseCaseDto} from './application/usecase-designer/usecase/dto/usecase-dto.js';
export {
  UsecaseIdentifierWithChangeInfoDtoSchema,
  CreateUsecasesResponseDtoSchema,
  CreateManualUsecasesResponseDtoSchema,
} from './application/usecase-designer/usecase/dto/usecase-dto.js';
export type {
  UsecaseIdentifierWithChangeInfoDto,
  CreateUsecasesResponseDto,
  CreateManualUsecasesResponseDto,
} from './application/usecase-designer/usecase/dto/usecase-dto.js';
export {
  UsecaseCategoryDtoSchema,
  DeleteUsecaseCategoryDtoSchema,
} from './application/usecase-designer/usecase/dto/usecase-category-dto.js';
export type {
  UsecaseCategoryDto,
  DeleteUsecaseCategoryDto,
} from './application/usecase-designer/usecase/dto/usecase-category-dto.js';
export {
  ComponentCollectionDtoSchema,
  ComponentCollectionWithSubsystemsDtoSchema,
  DataLinkDtoSchema,
  ControlLinkDtoSchema,
  mapComponentCollection,
  mapComponentCollectionWithSubsystems,
  mapSpfModuleForCollection,
  mapDataLink,
  mapControlLink,
} from './application/usecase-designer/usecase/dto/component-collection-dto.js';
export type {
  ComponentCollectionDto,
  ComponentCollectionWithSubsystemsDto,
  DataLinkDto,
  ControlLinkDto,
} from './application/usecase-designer/usecase/dto/component-collection-dto.js';
export * from './application/usecase-designer/data-links/create/create-data-link.command.js';
export * from './application/usecase-designer/data-links/create/create-data-link.handler.js';
export * from './application/usecase-designer/data-links/delete/delete-data-link.command.js';
export * from './application/usecase-designer/data-links/delete/delete-data-link.handler.js';
export * from './application/usecase-designer/control-links/create/create-control-link.command.js';
export * from './application/usecase-designer/control-links/create/create-control-link.handler.js';
export * from './application/usecase-designer/control-links/delete/delete-control-link.command.js';
export * from './application/usecase-designer/control-links/delete/delete-control-link.handler.js';
export {ControlLinkPropertiesDtoSchema} from './application/usecase-designer/control-links/dto/control-link-properties-dto.js';
export type {ControlLinkPropertiesDto} from './application/usecase-designer/control-links/dto/control-link-properties-dto.js';
// Generic Worker Abstractions
export * from './application/ports/worker/worker-pool.port.js';
export * from './application/ports/worker/handler-registry.port.js';
export * from './application/ports/worker/worker-types.js';

// File Operations - Upload File pipeline exports
export * from './application/file-operations/shared/utils/file-ref.js';
export * from './application/file-operations/upload-file/models/parsed-awsp.js';

// File Operations - Download File pipeline exports
export * from './application/ports/persistence/query-services/bulk-read/bulk-read-query-service.js';
export * from './application/file-operations/download-file/download-file.query.js';
export * from './application/file-operations/download-file/download-file.handler.js';
export * from './application/project/project-file-properties.query.js';
export * from './application/project/project-file-properties.handler.js';
export * from './application/ports/file-system/file-system.port.js';
export * from './application/file-operations/upload-file/types/chunk-parse.types.js';
export * from './application/file-operations/upload-file/types/entity-builder.types.js';
export * from './application/file-operations/upload-file/workers/parser-registry.js';
export * from './application/file-operations/upload-file/workers/entity-builder-registry.js';
export * from './application/file-operations/upload-file/services/acdb-chunk-parsers/base-chunk-parser.js';
export * from './application/file-operations/upload-file/services/acdb-chunk-parsers/header-chunk-parser.js';
export * from './application/file-operations/upload-file/services/acdb-chunk-parsers/tagged-module-map-chunk-parser.js';
export * from './application/file-operations/upload-file/services/acdb-parser.js';
export * from './application/file-operations/upload-file/services/acdb-file-orchestrator.js';
export * from './application/file-operations/upload-file/services/acdb-buffer-comparator.js';
export * from './application/file-operations/upload-file/services/awsp-parser.js';
export * from './application/file-operations/upload-file/services/awsp-file-orchestrator.js';
export * from './application/file-operations/upload-file/services/awsp-file-comparator.js';
export * from './application/file-operations/upload-file/upload-file.command.js';
export * from './application/file-operations/upload-file/upload-file.handler.js';

// ACDB models and chunks
export * from './application/file-operations/upload-file/models/chunk-metadata.js';
export * from './application/file-operations/upload-file/models/chunk-parse-context.js';
export * from './application/file-operations/upload-file/models/parsed-acdb.js';
export * from './application/file-operations/shared/acdb-chunks/base-chunk.js';
export * from './application/file-operations/shared/acdb-chunks/header-chunk.js';
export * from './application/file-operations/shared/acdb-chunks/subgraph-data-chunk.js';
export * from './application/file-operations/shared/acdb-chunks/tagged-module-map-chunk.js';
export * from './application/file-operations/upload-file/services/chunk-metadata-registry.js';

// ACDB entities and factories
export * from './domain/entities/common/entities/header.entity.js';
export * from './domain/entities/common/entities/kv-data.js';
export * from './domain/entities/driver-module-data/dkv-data.js';
export * from './domain/entities/common/value-objects/module-parameter-data.js';
export * from './domain/entities/common/entities/ckv-collection.js';
export * from './domain/entities/common/enums/port-io-type.js';
export * from './application/file-operations/upload-file/services/entity-builders/base-entity-builder.js';
export * from './application/file-operations/upload-file/services/entity-builders/header-entity.builder.js';

// Application - Entity building
export * from './application/file-operations/upload-file/services/entity-builder-service.js';

// Domain entities - usecase data
export * from './domain/entities/usecase-data/node/node.js';
export * from './domain/entities/usecase-data/links/link-type.js';
export * from './domain/entities/usecase-data/links/control-link.js';
export * from './domain/entities/usecase-data/links/data-link.js';
export * from './domain/entities/usecase-data/links/subsystem-control-link.js';
export * from './domain/entities/usecase-data/links/subsystem-data-link.js';
export * from './domain/entities/usecase-data/module/spf-module.js';
export * from './domain/entities/usecase-data/subsystem/subsystem.js';
export * from './domain/entities/driver-module-data/driver-module.js';
export * from './domain/entities/usecase-data/module/entities/spf-module-tag-data.js';
export * from './domain/entities/usecase-data/node/entities/data-port.js';
export * from './domain/entities/usecase-data/node/entities/control-port.js';
export * from './domain/entities/usecase-data/container/container.js';
export * from './domain/entities/usecase-data/container/value-objects/container-property.js';
export * from './domain/entities/usecase-data/subgraph/subgraph.js';
export * from './domain/entities/usecase-data/subgraph/entities/sgkv.js';
export * from './domain/entities/usecase-data/project/project.js';
export * from './domain/entities/usecase-data/project/arc-db-file.js';
export * from './domain/entities/usecase-data/usecase/usecase.js';
export * from './domain/entities/usecase-data/usecase/usecase-type.js';

// Domain entities - module manager
export * from './domain/entities/module-manager/module-manager-data.js';

// Domain entities - definitions
export * from './domain/entities/definitions/common/entities/module-definition.js';
export * from './domain/entities/definitions/spf-module/spf-module-definition.js';
export * from './domain/entities/definitions/spf-module/value-objects/data-port-group-definition.js';
export * from './domain/entities/definitions/spf-module/value-objects/data-port-definition.js';
export * from './domain/entities/definitions/spf-module/value-objects/static-control-port-definition.js';
export * from './domain/entities/definitions/spf-module/value-objects/dynamic-intent-definition.js';
export * from './domain/entities/definitions/driver-module/driver-module-definition.js';
export * from './domain/entities/definitions/driver-module/driver-module-parameter-definition.js';
export * from './domain/entities/definitions/key-value/key-definition.js';
export * from './domain/entities/definitions/key-value/entities/value-definition.js';

export * from './domain/entities/definitions/processor/processor-definition.js';
export * from './domain/entities/definitions/container/container-type-definition.js';
export * from './domain/entities/definitions/vcpm-module/vcpm-module-definition.js';
export * from './domain/entities/definitions/tag-key-value/tag-definition.js';
export * from './domain/entities/definitions/tag-key-value/value-objects/tag-key.js';
export * from './domain/entities/definitions/subgraph/subgraph-property-definitions.js';
export * from './domain/entities/definitions/common/entities/property-definition.js';

// Profiling
export * from './application/ports/profiling/profiler.port.js';
export * from './shared/profiling/profiler-types.js';

// ID generation port
export * from './application/ports/id-generation/id-generation.port.js';

// Natural ID generation
export * from './application/ports/id-generation/natural-id-generation.port.js';
export * from './domain/services/natural-id-generator/natural-id-type.js';
export * from './domain/services/natural-id-generator/vmid-remapping.js';
export * from './domain/services/natural-id-generator/natural-id-generator.js';
export * from './application/services/natural-id-generator/natural-id.registry.js';

// Shared Issue vocabulary — base type for Result<T>.issues (design §2, FR-4)
// Named re-exports only: shared/issues re-exports IssueSeverity/IssueCategory/etc which
// would collide with domain/validation/issue.js wildcards below. Only unique symbols here.
export type {Issue} from './shared/issues/issue.js';
export {IssueFactory} from './shared/issues/factories.js';
export {ISSUE_CODE} from './shared/issues/operational-codes.js';
export type {IssueCode} from './shared/issues/operational-codes.js';
export {ISSUE_ENTITY_TYPE} from './shared/issues/impacted-entity.js';
export type {
  IssueEntityType,
  ImpactedEntity,
} from './shared/issues/impacted-entity.js';
export {IssueSeverity, IssueCategory} from './shared/issues/severity.js';
export {CLIENT_INPUT_TYPE} from './shared/issues/fix-option.js';
export type {ClientInputType} from './shared/issues/fix-option.js';

// Validation framework — domain types
export * from './domain/validation/issue.js';
export * from './domain/validation/validation-preferences.js';
export * from './domain/validation/validation-report.js';
export * from './domain/validation/validation-rule.js';
export * from './domain/validation/validation-context.js';

// Validation framework — application ports
export * from './application/ports/persistence/repositories/validation/validation-preferences.repository.js';
export * from './application/ports/persistence/repositories/validation/validation-query.repository.js';
export * from './application/ports/persistence/repositories/session/session.repository.js';

// Validation framework — CQRS
export * from './application/validation/queries/validate-file.query.js';
export * from './application/validation/commands/update-validation-preferences.command.js';
export * from './application/validation/commands/acknowledge-data-loss.command.js';
export * from './application/validation/validation-orchestrator.js';

// SPF Constants
export * from './application/file-operations/shared/constants/spf-ids.js';

// AWSP serializer v1 - configuration types (MODULE_PORT_STRATEGIES, PROCESSOR_DOMAINS, etc.)
// MODULE_PORT_STRATEGIES canonical source is domain/entities/common/enums/module-port-strategy.ts
export * from './application/file-operations/shared/awsp-serializers/v1/configuration/index.js';

// Port ID calculator — gap-filling natural ID generation for dynamic ports
export {
  nextDataPortIds,
  nextControlPortIds,
  MODULE_CONTROL_PORT_START,
} from './domain/services/port-id-calculator/port-id-calculator.js';

// Container property codecs — encode/decode property blobs (stack size, etc.)
export {
  encodeStackSize,
  decodeStackSize,
} from './domain/services/container-property/container-stack-size-codec.js';
