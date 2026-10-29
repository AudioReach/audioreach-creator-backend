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

type LinkResolution<TLink> = {
  isSegment: boolean;
  canonicalLink: TLink | null;
};

function makeUow(
  dataLinks: Map<number, LinkResolution<DataLink>>,
  controlLinks: Map<number, LinkResolution<ControlLink>>,
) {
  return {
    getDataLinkRepository: () => ({
      findCanonicalLinksByAnySystemIds: async (ids: readonly number[]) =>
        ids.map(requestedSystemId => ({
          requestedSystemId,
          ...(dataLinks.get(requestedSystemId) ?? {
            isSegment: false,
            canonicalLink: null,
          }),
        })),
    }),
    getControlLinkRepository: () => ({
      findCanonicalLinksByAnySystemIds: async (ids: readonly number[]) =>
        ids.map(requestedSystemId => ({
          requestedSystemId,
          ...(controlLinks.get(requestedSystemId) ?? {
            isSegment: false,
            canonicalLink: null,
          }),
        })),
    }),
  } as never;
}

function canonicalDataLink(id: number): DataLink {
  return {systemId: id, fileSystemId: 1} as DataLink;
}

function canonicalControlLink(id: number): ControlLink {
  return {systemId: id, fileSystemId: 1} as ControlLink;
}

function canonicalResolution<TLink>(link: TLink): LinkResolution<TLink> {
  return {isSegment: false, canonicalLink: link};
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
        new Map([[801, canonicalResolution(canonicalDataLink(801))]]),
        new Map([[901, canonicalResolution(canonicalControlLink(901))]]),
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
      makeUow(
        new Map([[801, canonicalResolution(canonicalDataLink(801))]]),
        new Map(),
      ),
    );

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind === RESULT_KIND.Fail) throw new Error('Expected success');
    expect(result.data.includedDataLinkSystemIds).toEqual([801]);
  });

  it('maps a data-link segment ID to its canonical parent', async () => {
    const result = await resolveRoutingLinkSelection(
      1,
      {
        activeSubgraphs: [],
        includedDataLinkSystemIds: ['802'],
        includedControlLinkSystemIds: [],
      },
      makeUow(
        new Map([
          [802, {isSegment: true, canonicalLink: canonicalDataLink(801)}],
        ]),
        new Map(),
      ),
    );

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind === RESULT_KIND.Fail) throw new Error('Expected success');
    expect(result.data.includedDataLinkSystemIds).toEqual([801]);
  });

  it('deduplicates canonical and segment IDs resolving to one data link', async () => {
    const canonical = canonicalDataLink(801);
    const result = await resolveRoutingLinkSelection(
      1,
      {
        activeSubgraphs: [],
        includedDataLinkSystemIds: ['801', '802'],
        includedControlLinkSystemIds: [],
      },
      makeUow(
        new Map([
          [801, canonicalResolution(canonical)],
          [802, {isSegment: true, canonicalLink: canonical}],
        ]),
        new Map(),
      ),
    );

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind === RESULT_KIND.Fail) throw new Error('Expected success');
    expect(result.data.includedDataLinkSystemIds).toEqual([801]);
  });

  it('fails when an ID is not a canonical link or a resolved segment', async () => {
    const result = await resolveRoutingLinkSelection(
      1,
      {
        activeSubgraphs: [],
        includedDataLinkSystemIds: ['555'],
        includedControlLinkSystemIds: [],
      },
      makeUow(
        new Map([[555, {isSegment: false, canonicalLink: null}]]),
        new Map(),
      ),
    );

    expect(result.kind).toBe(RESULT_KIND.Fail);
  });

  it('fails when a supplied segment is unresolved', async () => {
    const result = await resolveRoutingLinkSelection(
      1,
      {
        activeSubgraphs: [],
        includedDataLinkSystemIds: ['802'],
        includedControlLinkSystemIds: [],
      },
      makeUow(
        new Map([[802, {isSegment: true, canonicalLink: null}]]),
        new Map(),
      ),
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
