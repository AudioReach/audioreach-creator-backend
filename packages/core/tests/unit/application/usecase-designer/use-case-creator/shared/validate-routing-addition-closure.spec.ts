/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {emptyGraphEdits} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import {validateAutoRoutingAdditionClosure} from '../../../../../../src/application/usecase-designer/use-case-creator/shared/validate-routing-addition-closure.js';

function dataLink(systemId: number) {
  return {systemId} as never;
}

function controlLink(systemId: number) {
  return {systemId} as never;
}

describe('validateAutoRoutingAdditionClosure', () => {
  it('passes when all effective session additions are declared in scope', () => {
    const issues = validateAutoRoutingAdditionClosure(
      {
        activeSubgraphs: [
          {systemId: 10, sgkvs: []},
          {systemId: 20, sgkvs: []},
        ],
        includedDataLinkSystemIds: [100],
        includedControlLinkSystemIds: [200],
      },
      {
        ...emptyGraphEdits(),
        addedDataLinks: [dataLink(100)],
        addedControlLinks: [controlLink(200)],
      },
    );

    expect(issues).toHaveLength(0);
  });

  it('rejects a session-added data link absent from includedDataLinkSystemIds', () => {
    const issues = validateAutoRoutingAdditionClosure(
      {
        activeSubgraphs: [],
        includedDataLinkSystemIds: [],
        includedControlLinkSystemIds: [],
      },
      {...emptyGraphEdits(), addedDataLinks: [dataLink(999)]},
    );

    expect(issues).toHaveLength(1);
  });

  it('ignores a link that was added then deleted in the same session', () => {
    const link = dataLink(100);
    const issues = validateAutoRoutingAdditionClosure(
      {
        activeSubgraphs: [],
        includedDataLinkSystemIds: [],
        includedControlLinkSystemIds: [],
      },
      {
        ...emptyGraphEdits(),
        addedDataLinks: [link],
        deletedDataLinks: [link],
      },
    );

    expect(issues).toHaveLength(0);
  });
});
