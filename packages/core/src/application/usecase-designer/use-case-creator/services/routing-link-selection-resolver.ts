/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import {Result, RESULT_KIND} from '../../../shared/result/result.js';
import {parseId} from '../../shared/parse-id.js';
import {ISSUE_ENTITY_TYPE} from '../../../../shared/issues/impacted-entity.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import type {
  AutoRoutingCommandInput,
  RoutingCommandInput,
} from '../contracts/routing-command-input.js';
import type {RoutingSelection} from '../contracts/routing-input.js';

/**
 * Phase 0: parses raw string IDs and looks up each canonical link by system ID.
 *
 * Subsystem segment resolution (mapping a segment ID to its canonical parent)
 * is deferred to PR 9.5. Until then, an ID not found as a canonical link via
 * findBySystemId returns a not-found failure.
 */
export async function resolveRoutingLinkSelection(
  fileSystemId: number,
  input: RoutingCommandInput | AutoRoutingCommandInput,
  uow: UnitOfWork,
): Promise<Result<RoutingSelection>> {
  const activeSubgraphs = input.activeSubgraphs.map(subgraph => ({
    systemId: parseId(subgraph.systemId, 'activeSubgraphs.systemId'),
    sgkvs: subgraph.valueSystemIds.map(values =>
      values.map(value => parseId(value, 'activeSubgraphs.valueSystemIds')),
    ),
  }));

  const dataResult = await resolveLinks(
    fileSystemId,
    input.includedDataLinkSystemIds,
    'data',
    uow,
  );
  if (dataResult.kind === RESULT_KIND.Fail)
    return Result.fail(...dataResult.issues);

  const controlResult = await resolveLinks(
    fileSystemId,
    input.includedControlLinkSystemIds,
    'control',
    uow,
  );
  if (controlResult.kind === RESULT_KIND.Fail)
    return Result.fail(...controlResult.issues);

  const selectedUsecaseSystemIds =
    'usecaseSystemIds' in input && input.usecaseSystemIds?.length
      ? input.usecaseSystemIds.map(id => parseId(id, 'usecaseSystemIds'))
      : undefined;

  return Result.ok({
    activeSubgraphs,
    includedDataLinkSystemIds: dataResult.data,
    includedControlLinkSystemIds: controlResult.data,
    ...(selectedUsecaseSystemIds !== undefined && {selectedUsecaseSystemIds}),
  });
}

async function resolveLinks(
  fileSystemId: number,
  rawIds: readonly string[],
  kind: 'data' | 'control',
  uow: UnitOfWork,
): Promise<Result<readonly number[]>> {
  const canonical = new Set<number>();
  const repository =
    kind === 'data'
      ? uow.getDataLinkRepository()
      : uow.getControlLinkRepository();
  const entityType =
    kind === 'data'
      ? ISSUE_ENTITY_TYPE.DataLink
      : ISSUE_ENTITY_TYPE.ControlLink;

  for (const rawId of rawIds) {
    const id = parseId(
      rawId,
      `included${kind === 'data' ? 'Data' : 'Control'}LinkSystemIds`,
    );
    // TODO PR 9.5: if findBySystemId returns null, also check subsystem segments table.
    const link = await repository.findBySystemId(id, fileSystemId);
    if (link === null)
      return Result.fail(IssueFactory.notFound(entityType, id));
    canonical.add(id);
  }

  return Result.ok([...canonical]);
}
