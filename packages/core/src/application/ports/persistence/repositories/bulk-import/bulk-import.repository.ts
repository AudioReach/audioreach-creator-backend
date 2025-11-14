import type {
  SpfModule,
  Container,
  DataLink,
  ControlLink,
  ModuleDefinition,
  KeyDefinition,
  ProcessorDefinition,
  Subgraph,
  ContainerType,
} from '@arc/core';
import type {BulkEntityInsertResult} from '../../insert-result.js';
import type {BulkModuleInsertResult} from './spf-module-insertion-report.js';
import type {
  BulkDataLinkInsertResult,
  BulkControlLinkInsertResult,
} from './link-insertion-report.js';
import type {BulkModuleDefinitionInsertResult} from './spf-module-definition-insertion-report.js';
import type {BulkKeyDefinitionInsertResult} from './key-definition-insertion-report.js';

/**
 * Repository interface for bulk import operations using insert+query pattern.
 * All methods accept entities without systemId and return insertion reports with natural key mappings.
 * Success is determined by main table insert success; child failures are informational and do not cause rollback.
 */
export interface BulkImportRepository {
  /**
   * Insert SPF module instances in bulk, including CKV, TKV, and related entities.
   * Uses insert+query pattern to return natural key to systemId mappings.
   * Returns port mappings (data + control) needed for creating links.
   *
   * @param items - SPF modules without systemId (will be generated during insertion)
   * @returns Promise resolving to bulk module insertion result with instanceId->systemId mappings and port mappings
   *
   * @example
   * ```typescript
   * const modules: Omit<SpfModule, 'systemId'>[] = [
   *   { instanceId: 123, name: "AudioDecoder", ... }
   * ];
   * const result = await repository.insertSpfModules(modules);
   * const moduleSystemId = result.results[0].moduleIdMapping?.systemId;
   * const portSystemId = result.results[0].portMappings.dataPorts[0]?.systemId;
   * ```
   */
  insertSpfModules(
    items: readonly Omit<SpfModule, 'systemId'>[],
  ): Promise<BulkModuleInsertResult>;

  /**
   * Insert container rows in bulk.
   * Uses insert+query pattern to return natural key to systemId mappings.
   *
   * @param items - Containers without systemId (will be generated during insertion)
   * @returns Promise resolving to entity insertion result with containerId->systemId mappings
   */
  insertContainers(
    items: readonly Omit<Container, 'systemId'>[],
  ): Promise<BulkEntityInsertResult<number>>;

  /**
   * Insert subgraph rows in bulk.
   * Uses insert+query pattern to return natural key to systemId mappings.
   *
   * @param items - Subgraphs without systemId (will be generated during insertion)
   * @returns Promise resolving to entity insertion result with subgraphId->systemId mappings
   */
  insertSubgraphs(
    items: readonly Omit<Subgraph, 'systemId'>[],
  ): Promise<BulkEntityInsertResult<number>>;

  /**
   * Insert data link rows in bulk.
   * Uses insert+query pattern to return natural key to systemId mappings.
   * Links are created after modules, so they reference existing systemIds.
   *
   * @param items - Data links without systemId (will be generated during insertion)
   * @returns Promise resolving to data link insertion result with composite key->systemId mappings
   */
  insertDataLinks(
    items: readonly Omit<DataLink, 'systemId'>[],
  ): Promise<BulkDataLinkInsertResult>;

  /**
   * Insert control link rows in bulk.
   * Uses insert+query pattern to return natural key to systemId mappings.
   * Links are created after modules, so they reference existing systemIds.
   *
   * @param items - Control links without systemId (will be generated during insertion)
   * @returns Promise resolving to control link insertion result with composite key->systemId mappings
   */
  insertControlLinks(
    items: readonly Omit<ControlLink, 'systemId'>[],
  ): Promise<BulkControlLinkInsertResult>;

  /**
   * Insert module definition rows in bulk, including parameters, ports, and intents.
   * Uses insert+query pattern to return natural key to systemId mappings.
   * Returns parameter definition mappings needed for calibration workflows.
   *
   * @param items - Module definitions without systemId (will be generated during insertion)
   * @returns Promise resolving to module definition insertion result with definitionId->systemId mappings and parameter mappings
   */
  insertModuleDefinitions(
    items: readonly Omit<ModuleDefinition, 'systemId'>[],
  ): Promise<BulkModuleDefinitionInsertResult>;

  /**
   * Insert key definition rows in bulk, including value definitions.
   * Uses insert+query pattern to return natural key to systemId mappings.
   * Returns value definition mappings needed for calibration workflows.
   *
   * @param items - Key definitions without systemId (will be generated during insertion)
   * @returns Promise resolving to key definition insertion result with keyId->systemId mappings and value definition mappings
   */
  insertKeyDefinitions(
    items: readonly Omit<KeyDefinition, 'systemId'>[],
  ): Promise<BulkKeyDefinitionInsertResult>;

  /**
   * Insert processor definition rows in bulk.
   * Uses insert+query pattern to return natural key to systemId mappings.
   *
   * @param items - Processor definitions without systemId (will be generated during insertion)
   * @returns Promise resolving to entity insertion result with processorId->systemId mappings
   */
  insertProcessorDefinitions(
    items: readonly Omit<ProcessorDefinition, 'systemId'>[],
  ): Promise<BulkEntityInsertResult<number>>;

  /**
   * Insert container type definition rows in bulk.
   * Uses insert+query pattern to return natural key to systemId mappings.
   *
   * @param items - Container type definitions without systemId (will be generated during insertion)
   * @returns Promise resolving to entity insertion result with containerTypeId->systemId mappings
   */
  insertContainerTypeDefinitions(
    items: readonly Omit<ContainerType, 'systemId'>[],
  ): Promise<BulkEntityInsertResult<number>>;
}
