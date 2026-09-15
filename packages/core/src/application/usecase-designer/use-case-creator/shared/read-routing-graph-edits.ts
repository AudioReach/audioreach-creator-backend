/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {GraphEditSummary} from '../contracts/routing-input.js';

/** Reads all graph edits visible in the active session for one routing run. */
export async function readRoutingGraphEdits(
  uow: UnitOfWork,
  fileSystemId: number,
): Promise<GraphEditSummary> {
  const [subgraphs, dataLinks, controlLinks] = await Promise.all([
    uow.getSubgraphRepository().findChangedInSession(fileSystemId),
    uow.getDataLinkRepository().findChangedInSession(fileSystemId),
    uow.getControlLinkRepository().findChangedInSession(fileSystemId),
  ]);

  return {
    addedSgs: subgraphs.added,
    deletedSgs: subgraphs.deleted,
    addedDataLinks: dataLinks.added,
    deletedDataLinks: dataLinks.deleted,
    addedControlLinks: controlLinks.added,
    deletedControlLinks: controlLinks.deleted,
  };
}
