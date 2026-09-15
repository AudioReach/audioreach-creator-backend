/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it, jest} from '@jest/globals';
import type {UnitOfWork} from '../../../../../../src/application/ports/persistence/unit-of-work.js';
import {readRoutingGraphEdits} from '../../../../../../src/application/usecase-designer/use-case-creator/shared/read-routing-graph-edits.js';

describe('readRoutingGraphEdits', () => {
  it('maps every session graph-edit collection', async () => {
    const subgraphs = {added: [{systemId: 1}], deleted: [{systemId: 2}]};
    const dataLinks = {added: [{systemId: 3}], deleted: [{systemId: 4}]};
    const controlLinks = {added: [{systemId: 5}], deleted: [{systemId: 6}]};
    const uow = {
      getSubgraphRepository: () => ({
        findChangedInSession: jest.fn().mockResolvedValue(subgraphs),
      }),
      getDataLinkRepository: () => ({
        findChangedInSession: jest.fn().mockResolvedValue(dataLinks),
      }),
      getControlLinkRepository: () => ({
        findChangedInSession: jest.fn().mockResolvedValue(controlLinks),
      }),
    } as unknown as UnitOfWork;

    await expect(readRoutingGraphEdits(uow, 42)).resolves.toEqual({
      addedSgs: subgraphs.added,
      deletedSgs: subgraphs.deleted,
      addedDataLinks: dataLinks.added,
      deletedDataLinks: dataLinks.deleted,
      addedControlLinks: controlLinks.added,
      deletedControlLinks: controlLinks.deleted,
    });
  });
});
