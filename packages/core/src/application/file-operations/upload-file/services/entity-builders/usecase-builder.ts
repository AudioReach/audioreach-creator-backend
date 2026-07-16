/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {
  UseCase,
  type KeyVectorInput,
  type SubgraphPair,
} from '../../../../../domain/entities/usecase-data/usecase/usecase.js';
import {
  USECASE_TYPE,
  type UsecaseType,
} from '../../../../../domain/entities/usecase-data/usecase/usecase-type.js';
import type {UsecaseEntry} from '../../../shared/acdb-chunks/usecase-data-chunk.js';
import type {GkvAliasChunk} from '../../../shared/acdb-chunks/gkv-alias-chunk.js';
import type {ForeignKeyMapper} from '../foreign-key-mapper.js';
import type {Logger} from '../../../../../shared/types/logger.interface.js';
import type {IdGenerationPort} from '../../../../ports/id-generation/id-generation.port.js';
import type {UiMetadata} from '../../../shared/awsp-serializers/v1/ui-metadata/index.js';
import {parseKeyValueString} from '../../../shared/awsp-serializers/v1/ui-metadata/index.js';
import {asNaturalId} from '../../../../../shared/types/branded-ids.js';

export class UsecaseBuilder {
  constructor(
    private readonly idGenerator: IdGenerationPort,
    private readonly foreignKeyMapper: ForeignKeyMapper,
    private readonly logger?: Logger,
  ) {}

  async buildUsecases(
    usecaseEntries: UsecaseEntry[],
    fileSystemId: number,
    gkvAliasChunk?: GkvAliasChunk,
    uiMetadata?: UiMetadata,
  ): Promise<UseCase[]> {
    if (!usecaseEntries || usecaseEntries.length === 0) {
      return [];
    }

    const usecases: UseCase[] = [];
    let successCount = 0;
    let errorCount = 0;

    // Pre-resolve each ui-metadata usecase keyValue into a sorted set of valueSystemIds
    const resolvedUiUsecases: {type: UsecaseType; valueSystemIdSet: string}[] =
      [];
    for (const uiUc of uiMetadata?.usecases ?? []) {
      const pairs = parseKeyValueString(uiUc.keyValue);
      const ids = pairs
        .map(({keyId, valueId}) =>
          this.foreignKeyMapper?.getValueSystemId(
            asNaturalId(keyId),
            asNaturalId(valueId),
          ),
        )
        .filter(id => id !== undefined)
        .map(id => id as number)
        .sort((a, b) => a - b);
      const validValues = Object.values(USECASE_TYPE) as string[];
      if (ids.length > 0 && validValues.includes(uiUc.type)) {
        resolvedUiUsecases.push({
          type: uiUc.type as UsecaseType,
          valueSystemIdSet: ids.join(','),
        });
      }
    }

    for (const [i, usecaseEntry] of usecaseEntries.entries()) {
      try {
        const usecase = await this.convertUsecaseEntry(
          usecaseEntry,
          i,
          fileSystemId,
          gkvAliasChunk,
          resolvedUiUsecases,
        );
        usecases.push(usecase);
        successCount++;
      } catch (error) {
        errorCount++;
        this.logger?.logWarn({
          msg: `Failed to convert usecase entry ${i}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          action: 'usecase_conversion_failed',
          component: 'UsecaseBuilder',
          tag: 'usecase-building',
          timestamp: new Date(),
        });
      }
    }

    this.logger?.logInfo({
      msg: `Converted ${successCount} usecases successfully, ${errorCount} failed, system IDs assigned`,
      action: 'usecase_conversion_complete',
      component: 'UsecaseBuilder',
      tag: 'usecase-building',
      timestamp: new Date(),
    });

    return usecases;
  }

  private async convertUsecaseEntry(
    entry: UsecaseEntry,
    index: number,
    fileSystemId: number,
    gkvAliasChunk?: GkvAliasChunk,
    resolvedUiUsecases: {type: UsecaseType; valueSystemIdSet: string}[] = [],
  ): Promise<UseCase> {
    const keyVector = this.convertToKeyVector(entry, index);
    const systemId = await this.idGenerator.getNextId(fileSystemId);

    const subgraphSystemIds: number[] = [];
    for (const naturalSgId of entry.sgList) {
      const sgSystemId = this.foreignKeyMapper.getSubgraphSystemId(
        asNaturalId(naturalSgId),
      );
      if (sgSystemId === undefined) {
        this.logger?.logWarn({
          msg: `No subgraph mapping found for natural subgraph ID ${naturalSgId} in usecase ${index}`,
          action: 'subgraph_mapping_missing',
          component: 'UsecaseBuilder',
          tag: 'usecase-building',
          timestamp: new Date(),
        });
      } else {
        subgraphSystemIds.push(sgSystemId);
      }
    }

    const subgraphPairs: SubgraphPair[] = [];
    for (const pair of entry.sgPairList) {
      const sgASystemId = this.foreignKeyMapper.getSubgraphSystemId(
        asNaturalId(pair.source),
      );
      const sgBSystemId = this.foreignKeyMapper.getSubgraphSystemId(
        asNaturalId(pair.destination),
      );
      if (sgASystemId !== undefined && sgBSystemId !== undefined) {
        subgraphPairs.push({
          sourceSubgraphSystemId: sgASystemId,
          destSubgraphSystemId: sgBSystemId,
        });
      } else {
        this.logger?.logWarn({
          msg: `Failed to resolve subgraph pair (${pair.source}, ${pair.destination}) in usecase ${index}`,
          action: 'subgraph_pair_mapping_missing',
          component: 'UsecaseBuilder',
          tag: 'usecase-building',
          timestamp: new Date(),
        });
      }
    }

    const aliasEntry = gkvAliasChunk?.getAlias(entry.keyValuePairList);

    const sortedSet = [...keyVector.valueSystemIds]
      .sort((a, b) => a - b)
      .join(',');
    const matched = resolvedUiUsecases.find(
      u => u.valueSystemIdSet === sortedSet,
    );
    const type = matched?.type;

    return new UseCase({
      systemId,
      fileSystemId,
      keyVector,
      subgraphSystemIds,
      subgraphPairs,
      alias: aliasEntry?.usecaseName,
      aliasId: aliasEntry?.usecaseId,
      categories: undefined, //TODO:
      type,
    });
  }

  private convertToKeyVector(
    entry: UsecaseEntry,
    index: number,
  ): KeyVectorInput {
    if (
      !entry.keyValuePairList?.keyValueList ||
      entry.keyValuePairList.keyValueList.length === 0
    ) {
      throw new Error(`No key-value pairs found in usecase entry ${index}`);
    }

    const valueSystemIds: number[] = [];

    for (const keyValue of entry.keyValuePairList.keyValueList) {
      try {
        const valueSystemId = this.foreignKeyMapper?.getValueSystemId(
          asNaturalId(keyValue.keyId),
          asNaturalId(keyValue.value),
        );

        if (valueSystemId) {
          valueSystemIds.push(valueSystemId);
        } else {
          this.logger?.logWarn({
            msg: `No foreign key mapping found for key-value pair (${keyValue.keyId}:${keyValue.value}) in usecase ${index}`,
            action: 'missing_value_mapping',
            component: 'UsecaseBuilder',
            tag: 'foreign-key-mapping',
            timestamp: new Date(),
          });
        }
      } catch (error) {
        this.logger?.logWarn({
          msg: `Failed to map key-value pair (${keyValue.keyId}:${keyValue.value}) in usecase ${index}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          action: 'key_value_mapping_failed',
          component: 'UsecaseBuilder',
          tag: 'usecase-building',
          timestamp: new Date(),
        });
      }
    }

    if (valueSystemIds.length === 0) {
      throw new Error(
        `No valid value systemIds found for usecase entry ${index}. All ${entry.keyValuePairList.keyValueList.length} key-value pairs failed to map.`,
      );
    }

    return {valueSystemIds};
  }
}
