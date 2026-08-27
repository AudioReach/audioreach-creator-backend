/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {Subgraph} from '../../../../../domain/entities/usecase-data/subgraph/subgraph.js';
import {Sgkv} from '../../../../../domain/entities/usecase-data/subgraph/entities/sgkv.js';
import {SubgraphPropertyData} from '../../../../../domain/entities/usecase-data/subgraph/value-objects/subgraph-property.js';
import type {AcdbSubgraphProperties} from '../../../shared/acdb-chunks/spf-properties/types.js';
import type {Logger} from '../../../../../shared/types/logger.interface.js';
import type {IdGenerationPort} from '../../../../ports/id-generation/id-generation.port.js';
import type {ForeignKeyMapper} from '../foreign-key-mapper.js';
import type {
  UiMetadata,
  UiSubgraph,
} from '../../../shared/awsp-serializers/v1/ui-metadata/index.js';
import {parseKeyValueString} from '../../../shared/awsp-serializers/v1/ui-metadata/index.js';
import {
  asNaturalId,
  asSystemId,
} from '../../../../../shared/types/branded-ids.js';
import type {BuildResult} from '../../types/issue-collection.js';
import type {Issue} from '../../../../../shared/issues/index.js';
import {
  IssueSeverity,
  ISSUE_ENTITY_TYPE,
} from '../../../../../shared/issues/index.js';
import {ERROR_CODES} from '../../../../../shared/errors/error-codes.js';

/**
 * Builder for converting SubgraphProperty data to Subgraph domain entities.
 * Simplified sequential implementation similar to UsecaseBuilder.
 */
export class SubgraphBuilder {
  constructor(
    private readonly idGenerator: IdGenerationPort,
    private readonly foreignKeyMapper: ForeignKeyMapper,
    private readonly logger?: Logger,
  ) {}

  /**
   * Build Subgraph entities from subgraph properties with system IDs assigned
   * Main API method similar to UsecaseBuilder.buildUsecases()
   */
  async buildSubgraphs(
    subgraphProperties: AcdbSubgraphProperties[],
    fileSystemId: number,
    uiMetadata?: UiMetadata,
  ): Promise<BuildResult<Subgraph>> {
    // Input validation
    if (!subgraphProperties || subgraphProperties.length === 0) {
      return {entities: [], issues: []};
    }

    const uiSubgraphMap = new Map(
      (uiMetadata?.subgraphs ?? []).map(s => [s.id, s]),
    );

    // Step 1: Build entities (systemId = 0)
    const result = this.buildSequential(subgraphProperties, uiSubgraphMap);

    // Step 2: Assign system IDs to all successfully built entities
    if (result.entities.length > 0) {
      await this.assignSystemIds(result.entities, fileSystemId);
    }

    // Step 3: Deduplicate names within this file upload
    this.deduplicateNames(result.entities);

    this.logger?.logInfo({
      msg: 'subgraph_building_complete',
      description: `Successfully built ${result.entities.length} subgraphs with system IDs assigned, ${result.issues.length} failed`,
      component: 'SubgraphBuilder',
      tag: 'subgraph-building',
    });

    return result;
  }

  /**
   * Assign system IDs to subgraphs.
   * Also stores foreign key mappings immediately after ID generation.
   * Mutates the input objects directly.
   *
   * @param subgraphs - Subgraphs with systemId = 0 (from builder)
   * @param fileSystemId - File system ID to assign
   */
  private async assignSystemIds(
    subgraphs: Subgraph[],
    fileSystemId: number,
  ): Promise<void> {
    for (const subgraph of subgraphs) {
      subgraph.fileSystemId = fileSystemId;
      subgraph.systemId = await this.idGenerator.getNextId(fileSystemId);
      this.foreignKeyMapper.addSubgraphMapping(
        asNaturalId(subgraph.subgraphId),
        asSystemId(subgraph.systemId),
      );
      for (const sgkv of subgraph.sgkvs) {
        sgkv.systemId = await this.idGenerator.getNextId(fileSystemId);
      }
    }
  }

  /**
   * Build subgraphs sequentially in the main thread
   * Creates objects with systemId = 0 and fileSystemId = 0 (to be assigned later)
   */
  private buildSequential(
    subgraphProperties: AcdbSubgraphProperties[],
    uiSubgraphMap: Map<number, UiSubgraph>,
  ): BuildResult<Subgraph> {
    // Direct conversion logic
    const subgraphs: Subgraph[] = [];
    const issues: Issue[] = [];

    for (const subgraphProperty of subgraphProperties) {
      try {
        const subgraph = this.convertAcdbSubgraphPropertyData(
          subgraphProperty,
          uiSubgraphMap,
        );
        subgraphs.push(subgraph);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        const issue = this.convertToEntityBuildIssue(
          errorMessage,
          subgraphProperty.subgraphId,
        );
        issues.push(issue);

        this.logger?.logWarn({
          msg: 'subgraph_conversion_failed',
          description: `Failed to convert subgraph property (ID: ${subgraphProperty.subgraphId}): ${errorMessage}`,
          component: 'SubgraphBuilder',
          tag: 'subgraph-building',
        });
      }
    }

    return {
      entities: subgraphs,
      issues,
    };
  }

  /**
   * Convert single SubgraphProperty to Subgraph entity
   */
  private convertAcdbSubgraphPropertyData(
    subgraphPropertyData: AcdbSubgraphProperties,
    uiSubgraphMap: Map<number, UiSubgraph>,
  ): Subgraph {
    // Build property list, skipping any with unresolved definition IDs
    const properties: SubgraphPropertyData[] = [];
    for (const [propertyId, propertyData] of subgraphPropertyData.properties) {
      const propertySystemId =
        this.foreignKeyMapper.getSubgraphPropertyDefinitionSystemId(
          asNaturalId(propertyId),
        );

      if (propertySystemId === undefined) {
        this.logger?.logWarn({
          msg: 'property_definition_not_found',
          description: `Subgraph property definition not found for propertyId ${propertyId} in subgraph ${subgraphPropertyData.subgraphId}`,
          component: 'SubgraphBuilder',
          tag: 'subgraph-building',
        });
        continue;
      }

      properties.push(new SubgraphPropertyData(propertySystemId, propertyData));
    }

    const uiEntry = uiSubgraphMap.get(subgraphPropertyData.subgraphId);
    const name = uiEntry?.name ?? `Subgraph_${subgraphPropertyData.subgraphId}`;

    const sgkvs: Sgkv[] = [];
    const seenFingerprints = new Set<string>();
    for (const kv of uiEntry?.supportedKeyValues ?? []) {
      const pairs = parseKeyValueString(kv.keyValue);
      const valueSystemIds: number[] = [];
      for (const {keyId, valueId} of pairs) {
        const vsId = this.foreignKeyMapper.getValueSystemId(
          asNaturalId(keyId),
          asNaturalId(valueId),
        );
        if (vsId === undefined) {
          this.logger?.logWarn({
            msg: 'sgkv_value_not_found',
            description: `SGKV value not found for key=0x${keyId.toString(16)} value=0x${valueId.toString(16)} in subgraph ${name}`,
            component: 'SubgraphBuilder',
            tag: 'subgraph-building',
          });
        } else {
          valueSystemIds.push(vsId);
        }
      }
      if (valueSystemIds.length > 0 || pairs.length === 0) {
        //TODO: Remove this logic once files are corrected
        const fingerprint = [...valueSystemIds].sort((a, b) => a - b).join(',');
        if (seenFingerprints.has(fingerprint)) {
          this.logger?.logWarn({
            msg: 'sgkv_duplicate_skipped',
            description: `Duplicate SGKV skipped for subgraph ${name} (keyValue="${kv.keyValue}")`,
            component: 'SubgraphBuilder',
            tag: 'subgraph-building',
          });
          continue;
        }
        seenFingerprints.add(fingerprint);
        sgkvs.push(
          new Sgkv({systemId: 0, valueDefinitionSystemIds: valueSystemIds}),
        );
      }
    }

    return new Subgraph({
      systemId: 0,
      subgraphId: subgraphPropertyData.subgraphId,
      name,
      isExported: false, //TODO: get from workspace
      fileSystemId: 0,
      properties,
      sgkvs,
    });
  }

  private convertToEntityBuildIssue(
    errorMessage: string,
    subgraphId?: number,
  ): Issue {
    return {
      code: ERROR_CODES.INVALID_ENTITY_DATA,
      message: errorMessage,
      severity: IssueSeverity.Error,
      impactedEntity: {
        entityType: ISSUE_ENTITY_TYPE.Subgraph,
        systemId: subgraphId ?? 0,
      },
    };
  }

  private deduplicateNames(subgraphs: Subgraph[]): void {
    const counts = new Map<string, number>();
    for (const s of subgraphs) {
      counts.set(s.name, (counts.get(s.name) ?? 0) + 1);
    }

    const duplicateGroups = new Map<string, string[]>();
    const counters = new Map<string, number>();
    for (const s of subgraphs) {
      if ((counts.get(s.name) ?? 1) > 1) {
        const originalName = s.name;
        const n = (counters.get(originalName) ?? 0) + 1;
        counters.set(originalName, n);
        s.name = `${originalName}_${n}`;

        const group = duplicateGroups.get(originalName) ?? [];
        group.push(s.name);
        duplicateGroups.set(originalName, group);
      }
    }

    for (const [original, renamed] of duplicateGroups) {
      const renamedList = renamed.map(n => `"${n}"`).join(', ');
      this.logger?.logWarn({
        msg: 'subgraph_name_deduplicated',
        description: `Duplicate subgraph name "${original}" found — renamed to ${renamedList}`,
        component: 'SubgraphBuilder',
        tag: 'subgraph-building',
      });
    }
  }
}
