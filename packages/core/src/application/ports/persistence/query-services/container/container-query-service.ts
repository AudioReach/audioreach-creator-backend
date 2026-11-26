/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ContainerReadModel} from './container-read-model.js';
import type {PropertyPayloadReadModel} from '../shared/property-payload-read-model.js';
import type {Result} from '../../../../shared/result/result.js';
import type {BatchRead} from '../../batch-read.js';
import type {IdentifiedEntityRef} from '../../../../../domain/identity/entity-identity.js';
import type {ENTITY_TYPE} from '../../../../../shared/entity-type.js';

export interface ContainerQueryService {
  /**
   * Returns every or selected ContainerReadModel for the given fileSystemId.
   * Overlay is always applied internally — no applyOverlay flag.
   */
  getAllContainers(
    fileSystemId: number,
    systemIds?: number[],
  ): Promise<Result<ContainerReadModel[]>>;

  /**
   * Returns property payloads for the specified container, with session overlay applied.
   *
   * - `Result.fail` — DB error.
   * - `Result.ok(null)` — container does not exist (caller should throw 404).
   * - `Result.ok(PropertyPayloadReadModel[])` — container exists; list may be empty.
   */
  findPropertyPayloads(
    containerSystemId: number,
    fileSystemId: number,
  ): Promise<Result<PropertyPayloadReadModel[] | null>>;

  /**
   * Reads the identities of the given containers. A systemId that is not
   * a container of the file is `NOT_FOUND`.
   * An entity deleted in the session is read from committed data, so it
   * is named as the user last saw it; this is not an existence check.
   */
  findContainerIdentities(
    fileSystemId: number,
    containerSystemIds: readonly number[],
  ): Promise<
    BatchRead<
      IdentifiedEntityRef<typeof ENTITY_TYPE.Container>,
      typeof ENTITY_TYPE.Container
    >
  >;
}
