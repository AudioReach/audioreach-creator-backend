/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {DataLinkRepository} from '../../../ports/persistence/repositories/data-link/data-link.repository.js';
import type {ControlLinkRepository} from '../../../ports/persistence/repositories/control-link/control-link.repository.js';
import {requireAll} from '../../../shared/result/require-all.js';
import {parseId} from '../../shared/parse-id.js';
import type {
  AutoRoutingCommandInput,
  RoutingCommandInput,
} from '../contracts/routing-command-input.js';
import type {RoutingSelection} from '../contracts/routing-input.js';

/**
 * Phase 0: parses request IDs and normalizes canonical and subsystem-segment
 * IDs to their effective canonical links. Throws ResourceNotFoundException
 * when a requested link does not exist.
 */
export async function resolveRoutingLinkSelection(
  fileSystemId: number,
  input: RoutingCommandInput | AutoRoutingCommandInput,
  uow: UnitOfWork,
): Promise<RoutingSelection> {
  const activeSubgraphs = input.activeSubgraphs.map(subgraph => ({
    systemId: parseId(subgraph.systemId, 'activeSubgraphs.systemId'),
    sgkvs: subgraph.valueSystemIds.map(values =>
      values.map(value => parseId(value, 'activeSubgraphs.valueSystemIds')),
    ),
  }));

  const [includedDataLinkSystemIds, includedControlLinkSystemIds] =
    await Promise.all([
      resolveLinks(
        uow.getDataLinkRepository(),
        fileSystemId,
        input.includedDataLinkSystemIds,
        'includedDataLinkSystemIds',
      ),
      resolveLinks(
        uow.getControlLinkRepository(),
        fileSystemId,
        input.includedControlLinkSystemIds,
        'includedControlLinkSystemIds',
      ),
    ]);

  const selectedUsecaseSystemIds =
    'usecaseSystemIds' in input && input.usecaseSystemIds?.length
      ? input.usecaseSystemIds.map(id => parseId(id, 'usecaseSystemIds'))
      : undefined;

  return {
    activeSubgraphs,
    includedDataLinkSystemIds,
    includedControlLinkSystemIds,
    ...(selectedUsecaseSystemIds !== undefined && {selectedUsecaseSystemIds}),
  };
}

/** Parses raw link IDs and returns the IDs of their canonical links. */
async function resolveLinks(
  repository: DataLinkRepository | ControlLinkRepository,
  fileSystemId: number,
  rawIds: readonly string[],
  fieldName: string,
): Promise<readonly number[]> {
  if (rawIds.length === 0) return [];
  const ids = rawIds.map(rawId => parseId(rawId, fieldName));
  const batch = await repository.findCanonicalLinks(fileSystemId, ids);
  // Explicit type args: the repository union yields a union of batch types.
  return requireAll<{readonly systemId: number}, typeof batch.entityType>(
    batch,
  ).map(link => link.systemId);
}
