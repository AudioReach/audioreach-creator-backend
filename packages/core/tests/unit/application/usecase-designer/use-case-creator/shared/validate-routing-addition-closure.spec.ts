/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {LINK_TYPE} from '../../../../../../src/domain/entities/usecase-data/links/link-type.js';
import type {DataLink} from '../../../../../../src/domain/entities/usecase-data/links/data-link.js';
import type {Subgraph} from '../../../../../../src/domain/entities/usecase-data/subgraph/subgraph.js';
import {emptyGraphEdits} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import {validateRoutingAdditionClosure} from '../../../../../../src/application/usecase-designer/use-case-creator/shared/validate-routing-addition-closure.js';

describe('validateRoutingAdditionClosure', () => {
  it('returns every addition-side FR-API-07 conflict in one issue', () => {
    const issues = validateRoutingAdditionClosure(
      {
        activeSubgraphs: [{systemId: 10, sgkvs: []}],
        excludedSubgraphSystemIds: [20, 30],
        excludedDataLinkSystemIds: [100],
        excludedControlLinkSystemIds: [200],
      },
      {
        ...emptyGraphEdits(),
        addedSgs: [{systemId: 20}, {systemId: 40}] as Subgraph[],
        deletedSgs: [{systemId: 30}] as Subgraph[],
        addedDataLinks: [
          {
            systemId: 100,
            linkType: LINK_TYPE.IntraUsecase,
            sourceSubgraphSystemId: 10,
            destSubgraphSystemId: 30,
          },
        ] as DataLink[],
        addedControlLinks: [{systemId: 200}] as never[],
      },
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]).toEqual(
      expect.objectContaining({
        code: 'ARC-ROUTING-PREVAL-EDIT-SCOPE-CONFLICT',
        message: expect.stringMatching(
          /excludedAddedSubgraphSystemIds=\[20\].*excludedAddedDataLinkSystemIds=\[100\].*excludedAddedControlLinkSystemIds=\[200\].*missingAddedSubgraphSystemIds=\[20, 40\].*missingRequiredEndpointSubgraphSystemIds=\[30\].*excludedRequiredEndpointSubgraphSystemIds=\[30\].*deletedAddedLinkEndpointSubgraphSystemIds=\[30\]/,
        ),
      }),
    );
  });

  it('does not require added control-link endpoints in routing scope', () => {
    expect(
      validateRoutingAdditionClosure(
        {
          activeSubgraphs: [],
          excludedSubgraphSystemIds: [],
          excludedDataLinkSystemIds: [],
          excludedControlLinkSystemIds: [],
        },
        {
          ...emptyGraphEdits(),
          addedControlLinks: [
            {
              systemId: 200,
              sourceSubgraphSystemId: 10,
              destSubgraphSystemId: 20,
            },
          ] as never[],
        },
      ),
    ).toEqual([]);
  });
});
