/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it, jest} from '@jest/globals';
import type {
  ControlLink,
  DataLink,
} from '../../../../../../src/domain/index.js';
import type {BatchRead} from '../../../../../../src/application/ports/persistence/batch-read.js';
import {resolveRoutingLinkSelection} from '../../../../../../src/application/usecase-designer/use-case-creator/services/routing-link-selection-resolver.js';
import {ENTITY_TYPE} from '../../../../../../src/shared/entity-type.js';
import {ResourceNotFoundException} from '../../../../../../src/shared/exceptions/resource-not-found.exception.js';
import {batchOf, notFoundBatch} from '../../../../../helpers/batch-read.js';

type DataBatch = BatchRead<DataLink, typeof ENTITY_TYPE.DataLink>;
type ControlBatch = BatchRead<ControlLink, typeof ENTITY_TYPE.ControlLink>;

function makeUow(
  dataBatch: DataBatch = batchOf(ENTITY_TYPE.DataLink, []),
  controlBatch: ControlBatch = batchOf(ENTITY_TYPE.ControlLink, []),
) {
  const dataRepo = {
    findCanonicalLinks: jest.fn(async () => dataBatch),
  };
  const controlRepo = {
    findCanonicalLinks: jest.fn(async () => controlBatch),
  };
  const uow = {
    getDataLinkRepository: () => dataRepo,
    getControlLinkRepository: () => controlRepo,
  } as never;
  return {uow, dataRepo, controlRepo};
}

function dataLink(id: number): DataLink {
  return {systemId: id, fileSystemId: 1} as DataLink;
}

function controlLink(id: number): ControlLink {
  return {systemId: id, fileSystemId: 1} as ControlLink;
}

describe('resolveRoutingLinkSelection', () => {
  it('parses string IDs and returns a canonical RoutingSelection', async () => {
    const {uow, dataRepo, controlRepo} = makeUow(
      batchOf(ENTITY_TYPE.DataLink, [dataLink(801)]),
      batchOf(ENTITY_TYPE.ControlLink, [controlLink(901)]),
    );

    const selection = await resolveRoutingLinkSelection(
      1,
      {
        activeSubgraphs: [{systemId: '10', valueSystemIds: []}],
        includedDataLinkSystemIds: ['801'],
        includedControlLinkSystemIds: ['901'],
      },
      uow,
    );

    expect(dataRepo.findCanonicalLinks).toHaveBeenCalledWith(1, [801]);
    expect(controlRepo.findCanonicalLinks).toHaveBeenCalledWith(1, [901]);
    expect(selection.includedDataLinkSystemIds).toEqual([801]);
    expect(selection.includedControlLinkSystemIds).toEqual([901]);
    expect(selection.activeSubgraphs[0]?.systemId).toBe(10);
  });

  it('selects the canonical links returned for segment IDs', async () => {
    const {uow} = makeUow(batchOf(ENTITY_TYPE.DataLink, [dataLink(801)]));

    const selection = await resolveRoutingLinkSelection(
      1,
      {
        activeSubgraphs: [],
        includedDataLinkSystemIds: ['802'],
        includedControlLinkSystemIds: [],
      },
      uow,
    );

    expect(selection.includedDataLinkSystemIds).toEqual([801]);
  });

  it('does not read links when none are selected', async () => {
    const {uow, dataRepo, controlRepo} = makeUow();

    const selection = await resolveRoutingLinkSelection(
      1,
      {
        activeSubgraphs: [],
        includedDataLinkSystemIds: [],
        includedControlLinkSystemIds: [],
      },
      uow,
    );

    expect(dataRepo.findCanonicalLinks).not.toHaveBeenCalled();
    expect(controlRepo.findCanonicalLinks).not.toHaveBeenCalled();
    expect(selection.includedDataLinkSystemIds).toEqual([]);
    expect(selection.includedControlLinkSystemIds).toEqual([]);
  });

  it('throws ResourceNotFoundException when a data link is not found', async () => {
    const {uow} = makeUow(notFoundBatch(ENTITY_TYPE.DataLink, 555));

    await expect(
      resolveRoutingLinkSelection(
        1,
        {
          activeSubgraphs: [],
          includedDataLinkSystemIds: ['555'],
          includedControlLinkSystemIds: [],
        },
        uow,
      ),
    ).rejects.toThrow(ResourceNotFoundException);
  });

  it('throws ResourceNotFoundException when a control link is not found', async () => {
    const {uow} = makeUow(
      undefined,
      notFoundBatch(ENTITY_TYPE.ControlLink, 902),
    );

    await expect(
      resolveRoutingLinkSelection(
        1,
        {
          activeSubgraphs: [],
          includedDataLinkSystemIds: [],
          includedControlLinkSystemIds: ['902'],
        },
        uow,
      ),
    ).rejects.toThrow(ResourceNotFoundException);
  });

  it('preserves optional usecaseSystemIds', async () => {
    const {uow} = makeUow();

    const selection = await resolveRoutingLinkSelection(
      1,
      {
        activeSubgraphs: [],
        includedDataLinkSystemIds: [],
        includedControlLinkSystemIds: [],
        usecaseSystemIds: ['67890'],
      },
      uow,
    );

    expect(selection.selectedUsecaseSystemIds).toEqual([67890]);
  });
});
