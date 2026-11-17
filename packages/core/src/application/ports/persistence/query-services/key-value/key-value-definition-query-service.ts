/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {KeyDefinitionReadModel} from './key-value-definition-read-model.js';
import type {KeyValuePairReadModel} from '../usecase/query-models/key-vector-read-model.js';
import type {BatchRead} from '../../batch-read.js';
import type {ENTITY_TYPE} from '../../../../../shared/entity-type.js';
import type {IdentifiedEntityRef} from '../../../../../domain/identity/entity-identity.js';

/** Narrows `findAllKeyDefinitions` to the keys that match every field. */
export interface KeyDefinitionFilter {
  readonly naturalId?: number;
}

/**
 * Key and value definition reads, with the session overlay applied. All
 * methods throw on infrastructure errors.
 */
export interface KeyValueDefQueryService {
  /** Every key definition in the file, each with all its values. */
  findAllKeyDefinitions(
    fileSystemId: number,
    filter?: KeyDefinitionFilter,
  ): Promise<KeyDefinitionReadModel[]>;

  /**
   * The requested key definitions, each with all its values, in request
   * order. Missing IDs are reported in `failed` as `NOT_FOUND`.
   */
  findKeyDefinitions(
    fileSystemId: number,
    keySystemIds: readonly number[],
  ): Promise<
    BatchRead<KeyDefinitionReadModel, typeof ENTITY_TYPE.KeyDefinition>
  >;

  /**
   * One key/value summary pair per requested value definition, in request
   * order. A value that is missing, or whose key is missing, is reported in
   * `failed` as `NOT_FOUND`.
   */
  findKeyValuePairs(
    fileSystemId: number,
    valueDefSystemIds: readonly number[],
  ): Promise<
    BatchRead<KeyValuePairReadModel, typeof ENTITY_TYPE.ValueDefinition>
  >;

  /**
   * The name and natural ID of each requested key definition, in request
   * order. Missing IDs are reported in `failed` as `NOT_FOUND`.
   */
  findKeyDefinitionIdentities(
    fileSystemId: number,
    keySystemIds: readonly number[],
  ): Promise<
    BatchRead<
      IdentifiedEntityRef<typeof ENTITY_TYPE.KeyDefinition>,
      typeof ENTITY_TYPE.KeyDefinition
    >
  >;

  /**
   * The key and value (name and natural ID) of each requested value
   * definition, in request order. A value that is missing, or whose key is
   * missing, is reported in `failed` as `NOT_FOUND`.
   */
  findValueDefinitionIdentities(
    fileSystemId: number,
    valueDefSystemIds: readonly number[],
  ): Promise<
    BatchRead<
      IdentifiedEntityRef<typeof ENTITY_TYPE.ValueDefinition>,
      typeof ENTITY_TYPE.ValueDefinition
    >
  >;
}
