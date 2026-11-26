/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataPortReadModel} from '../spf-module/ports/data-port-read-model.js';
import type {ControlPortReadModel} from '../spf-module/ports/control-port-read-model.js';
import type {Result} from '../../../../shared/result/result.js';
import type {BatchRead} from '../../batch-read.js';
import type {IdentifiedEntityRef} from '../../../../../domain/identity/entity-identity.js';
import type {ENTITY_TYPE} from '../../../../../shared/entity-type.js';

/**
 * Common query service for node — used by any node type (SpfModule, Subsystem, etc.).
 *
 * Provides a unified interface for loading data ports and control ports
 * for a given node. Both are always needed together for graph-view assembly,
 * so combining them into one service avoids separate sub-service wiring.
 */
export interface NodeQueryService {
  getDataPorts(
    nodeSystemId: number,
    fileSystemId: number,
  ): Promise<Result<DataPortReadModel[]>>;

  getControlPorts(
    nodeSystemId: number,
    fileSystemId: number,
  ): Promise<Result<ControlPortReadModel[]>>;

  /**
   * Reads the identities of the given data ports of any node, module or
   * subsystem, each with its node. A systemId that is not a data port
   * of the file is `NOT_FOUND`.
   * A port whose node, or the node's module definition, is missing is
   * `UNRESOLVED_REFERENCE`, with that entity as `missingRef`.
   * An entity deleted in the session is read from committed data, so it
   * is named as the user last saw it; this is not an existence check.
   */
  findDataPortIdentities(
    fileSystemId: number,
    portSystemIds: readonly number[],
  ): Promise<
    BatchRead<
      IdentifiedEntityRef<typeof ENTITY_TYPE.DataPort>,
      typeof ENTITY_TYPE.DataPort
    >
  >;

  /**
   * Reads the identities of the given control ports of any node, module or
   * subsystem, each with its node. A systemId that is not a control port
   * of the file is `NOT_FOUND`.
   * A port whose node, or the node's module definition, is missing is
   * `UNRESOLVED_REFERENCE`, with that entity as `missingRef`.
   * An entity deleted in the session is read from committed data, so it
   * is named as the user last saw it; this is not an existence check.
   */
  findControlPortIdentities(
    fileSystemId: number,
    portSystemIds: readonly number[],
  ): Promise<
    BatchRead<
      IdentifiedEntityRef<typeof ENTITY_TYPE.ControlPort>,
      typeof ENTITY_TYPE.ControlPort
    >
  >;
}
