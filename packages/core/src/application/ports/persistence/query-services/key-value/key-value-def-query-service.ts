/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  KeyDefinitionReadModel,
  ValueDefinitionReadModel,
} from './key-value-definition-read-model.js';
import type {ConfigurationIncludes} from '../configuration-includes.js';

export interface KeyValueDefQueryService {
  /**
   * Given a value systemId, returns the overlaid ValueDefinitionReadModel
   * with its parent KeyDefinitionReadModel.
   * summary: systemId, keyId/valueId, name, description only.
   * fullDetails: all fields populated.
   * Returns null if absent from both DB and session.
   */
  getByValueDefinition(
    valueDefSystemId: number,
    fileSystemId: number,
    includes: ConfigurationIncludes,
  ): Promise<{
    key: KeyDefinitionReadModel;
    value: ValueDefinitionReadModel;
  } | null>;

  /**
   * Batch variant of getByValueDefinition — resolves many valueDefSystemIds
   * in a single DB query plus a single pair of overlay lookups, instead of
   * one getByValueDefinition call per id (which is an N+1 query pattern).
   * Returns a Map keyed by valueDefSystemId — ids absent from both DB and
   * session are simply not present in the map.
   */
  getByValueDefinitions(
    valueDefSystemIds: number[],
    fileSystemId: number,
    includes: ConfigurationIncludes,
  ): Promise<
    Map<number, {key: KeyDefinitionReadModel; value: ValueDefinitionReadModel}>
  >;

  /**
   * Given a key systemId, returns the overlaid KeyDefinitionReadModel
   * with all its child ValueDefinitionReadModels.
   * summary: systemId, keyId/valueId, name, description only.
   * fullDetails: all fields populated.
   * Returns null if absent from both DB and session.
   */
  getByKeyDefinition(
    keyDefSystemId: number,
    fileSystemId: number,
    includes: ConfigurationIncludes,
  ): Promise<{
    key: KeyDefinitionReadModel;
    values: ReadonlyArray<ValueDefinitionReadModel>;
  } | null>;
}
