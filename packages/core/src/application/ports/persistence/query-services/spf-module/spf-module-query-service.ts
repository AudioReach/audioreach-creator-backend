/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {SpfModuleReadModel} from './spf-module-read-model.js';
import type {SpfTuningConfigService} from './tuning/spf-tuning-config-service.js';
import type {Result} from '../../../../shared/result/result.js';
import type {CkvQueryService} from './ckv/ckv-query-service.js';
import type {TkvQueryService} from './tkv/tkv-query-service.js';
import type {BatchRead} from '../../batch-read.js';
import type {IdentifiedEntityRef} from '../../../../../domain/identity/entity-identity.js';
import type {ENTITY_TYPE} from '../../../../../shared/entity-type.js';

export interface SpfModuleQueryService {
  readonly ckvQueryService: CkvQueryService;
  readonly tkvQueryService: TkvQueryService;

  /**
   * Returns a single SPF module with ports and definition capabilities.
   * Overlay always applied.
   *
   * Returns `Result.fail` with `ENTITY_NOT_FOUND` if the module does not exist.
   * The caller (core handler) is responsible for deciding whether to throw.
   */
  getSpfModule(
    spfModuleSystemId: number,
    fileSystemId: number,
  ): Promise<Result<SpfModuleReadModel>>;

  /**
   * Returns SPF modules for the given system IDs.
   * Overlay always applied.
   * Unknown IDs are silently omitted — partial result.
   * Empty input returns `Result.fail(INVALID_INPUT)` — an empty request is a caller bug.
   */
  getSpfModules(
    systemIds: number[],
    fileSystemId: number,
  ): Promise<Result<SpfModuleReadModel[]>>;

  /**
   * Returns all SPF modules reachable from the given usecase system IDs.
   * Scoped via use_case_subgraphs → spf_modules.subgraph_system_id.
   * A module shared across multiple usecases appears ONCE — deduplicated by systemId.
   * Overlay applied.
   */
  findByUsecaseIds(
    usecaseSystemIds: number[],
    fileSystemId: number,
  ): Promise<Result<SpfModuleReadModel[]>>;

  /**
   * Returns all SPF modules whose subgraph_system_id = subgraphId.
   * Overlay applied.
   */
  findBySubgraphId(
    subgraphId: number,
    fileSystemId: number,
  ): Promise<Result<SpfModuleReadModel[]>>;

  /**
   * Reads the identities of the given CKVs. A systemId that is not
   * a CKV of the file is `NOT_FOUND`.
   * A CKV whose module or a value definition is missing is
   * `UNRESOLVED_REFERENCE`, with that entity as `missingRef`.
   * An entity deleted in the session is read from committed data, so it
   * is named as the user last saw it; this is not an existence check.
   */
  findCkvIdentities(
    fileSystemId: number,
    ckvSystemIds: readonly number[],
  ): Promise<
    BatchRead<
      IdentifiedEntityRef<typeof ENTITY_TYPE.Ckv>,
      typeof ENTITY_TYPE.Ckv
    >
  >;

  /**
   * Reads the identities of the given module tags. A systemId that is not
   * a tag on a module of the file is `NOT_FOUND`.
   * A tag whose module or tag definition is missing is
   * `UNRESOLVED_REFERENCE`, with that entity as `missingRef`.
   * An entity deleted in the session is read from committed data, so it
   * is named as the user last saw it; this is not an existence check.
   */
  findTagIdentities(
    fileSystemId: number,
    tagSystemIds: readonly number[],
  ): Promise<
    BatchRead<
      IdentifiedEntityRef<typeof ENTITY_TYPE.Tag>,
      typeof ENTITY_TYPE.Tag
    >
  >;

  /**
   * Reads the identities of the given TKVs. A systemId that is not
   * a TKV of the file is `NOT_FOUND`.
   * A TKV whose module tag, module, tag definition, or a value definition
   * is missing is `UNRESOLVED_REFERENCE`, with that entity as `missingRef`.
   * An entity deleted in the session is read from committed data, so it
   * is named as the user last saw it; this is not an existence check.
   */
  findTkvIdentities(
    fileSystemId: number,
    tkvSystemIds: readonly number[],
  ): Promise<
    BatchRead<
      IdentifiedEntityRef<typeof ENTITY_TYPE.Tkv>,
      typeof ENTITY_TYPE.Tkv
    >
  >;

  // Sub-services — reusable directly by handlers that need tuning config or CKV
  readonly spfTuningConfigService: SpfTuningConfigService;
}
