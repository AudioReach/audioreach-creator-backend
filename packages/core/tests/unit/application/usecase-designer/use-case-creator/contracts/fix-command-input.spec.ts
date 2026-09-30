/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {parseResolveSameGkvCollisionPayload} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/fix-command-input.js';

const replayInput = {
  selectedUsecaseSystemIds: [],
  activeSubgraphs: [],
  excludedSubgraphSystemIds: [],
  excludedDataLinkSystemIds: [],
  excludedControlLinkSystemIds: [],
};

describe('parseResolveSameGkvCollisionPayload', () => {
  it('parses SELECT_CANDIDATE with its stable alternative ID', () => {
    expect(
      parseResolveSameGkvCollisionPayload({
        mode: 'SELECT_CANDIDATE',
        collisionId: '11111111-1111-4111-8111-111111111111',
        alternativeId: '22222222-2222-4222-8222-222222222222',
        replayInput,
      }),
    ).toEqual({
      selection: {
        mode: 'SELECT_CANDIDATE',
        collisionId: '11111111-1111-4111-8111-111111111111',
        alternativeId: '22222222-2222-4222-8222-222222222222',
      },
      replayInput,
    });
  });

  it.each(['KEEP_EXISTING', 'MERGE_ALL'] as const)(
    'parses %s without an alternative ID',
    mode => {
      expect(
        parseResolveSameGkvCollisionPayload({
          mode,
          collisionId: '11111111-1111-4111-8111-111111111111',
          replayInput,
        }),
      ).toEqual({
        selection: {
          mode,
          collisionId: '11111111-1111-4111-8111-111111111111',
        },
        replayInput,
      });
    },
  );

  it('rejects SELECT_CANDIDATE without an alternative ID', () => {
    expect(() =>
      parseResolveSameGkvCollisionPayload({
        mode: 'SELECT_CANDIDATE',
        collisionId: '11111111-1111-4111-8111-111111111111',
        replayInput,
      }),
    ).toThrow();
  });
});
