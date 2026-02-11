/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {UseCase} from '@arc/core';
import type {
  UseCaseRow,
  UseCaseCategoryRow,
  KeyVectorRow,
} from '../../../entity-schema/index.js';
import {KvHashGenerator} from '../../../entity-schema/usecase-data/common/key-vector-schema.js';

/**
 * Map kvHash to KeyVector database row.
 *
 * @param kvHash - Pre-computed kvHash from valueSystemIds
 */
export function toKeyVectorRow(kvHash: string): KeyVectorRow {
  return {
    kvHash,
    useCaseSystemId: undefined, // Will be set after UseCase insertion
  } as KeyVectorRow;
}

/**
 * Map UseCase domain entity to database row.
 * Omits systemId (DB generates it).
 *
 * @param useCase - UseCase domain entity
 * @param keyVectorSystemId - KeyVector's systemId (FK)
 */
export function toUseCaseRow(
  useCase: Omit<UseCase, 'systemId'>,
  keyVectorSystemId: number,
): UseCaseRow {
  return {
    fileSystemId: useCase.fileSystemId,
    alias: useCase.alias || '',
    aliasId: useCase.aliasId || 0,
    keyVectorSystemId,
    // Note: Categories, nodes, links are handled via junction tables
  } as UseCaseRow;
}

/**
 * Map category name to database row.
 */
export function toCategoryRow(categoryName: string): UseCaseCategoryRow {
  return {
    name: categoryName,
  } as UseCaseCategoryRow;
}

/**
 * Generate kvHash for lookup purposes.
 */
export function generateKvHash(valueSystemIds: number[]): string {
  return KvHashGenerator.generateHash(valueSystemIds);
}
