/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import type {
  ControlLink,
  DataLink,
} from '../../../../../../src/domain/index.js';
import {RESULT_KIND} from '../../../../../../src/application/shared/result/result.js';
import {resolveRoutingLinkSelection} from '../../../../../../src/application/usecase-designer/use-case-creator/services/routing-link-selection-resolver.js';

function makeUow(
  dataLinks: Map<number, DataLink | null>,
  controlLinks: Map<number, ControlLink | null>,
) {
  return {
    getDataLinkRepository: () => ({
      findBySystemId: async (id: number) => dataLinks.get(id) ?? null,
    }),
    getControlLinkRepository: () => ({
      findBySystemId: async (id: number) => controlLinks.get(id) ?? null,
    }),
  } as never;
}

function canonicalDataLink(id: number): DataLink {
  return {systemId: id, fileSystemId: 1} as DataLink;
}

function canonicalControlLink(id: number): ControlLink {
  return {systemId: id, fileSystemId: 1} as ControlLink;
}

describe('resolveRoutingLinkSelection', () => {
  it('parses string IDs and returns a canonical RoutingSelection', async () => {
    const result = await resolveRoutingLinkSelection(
      1,
      {
        activeSubgraphs: [{systemId: '10', valueSystemIds: []}],
        includedDataLinkSystemIds: ['801'],
        includedControlLinkSystemIds: ['901'],
      },
      makeUow(
        new Map([[801, canonicalDataLink(801)]]),
        new Map([[901, canonicalControlLink(901)]]),
      ),
    );

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind === RESULT_KIND.Fail) throw new Error('Expected success');
    expect(result.data.includedDataLinkSystemIds).toEqual([801]);
    expect(result.data.includedControlLinkSystemIds).toEqual([901]);
    expect(result.data.activeSubgraphs[0]?.systemId).toBe(10);
  });

  it('deduplicates repeated canonical IDs', async () => {
    const result = await resolveRoutingLinkSelection(
      1,
      {
        activeSubgraphs: [],
        includedDataLinkSystemIds: ['801', '801'],
        includedControlLinkSystemIds: [],
      },
      makeUow(new Map([[801, canonicalDataLink(801)]]), new Map()),
    );

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind === RESULT_KIND.Fail) throw new Error('Expected success');
    expect(result.data.includedDataLinkSystemIds).toEqual([801]);
  });

  it('fails when an ID is not found as a canonical link', async () => {
    const result = await resolveRoutingLinkSelection(
      1,
      {
        activeSubgraphs: [],
        includedDataLinkSystemIds: ['555'],
        includedControlLinkSystemIds: [],
      },
      makeUow(new Map([[555, null]]), new Map()),
    );

    expect(result.kind).toBe(RESULT_KIND.Fail);
  });

  it('preserves optional usecaseSystemIds', async () => {
    const result = await resolveRoutingLinkSelection(
      1,
      {
        activeSubgraphs: [],
        includedDataLinkSystemIds: [],
        includedControlLinkSystemIds: [],
        usecaseSystemIds: ['67890'],
      },
      makeUow(new Map(), new Map()),
    );

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind === RESULT_KIND.Fail) throw new Error('Expected success');
    expect(result.data.selectedUsecaseSystemIds).toEqual([67890]);
  });
});
