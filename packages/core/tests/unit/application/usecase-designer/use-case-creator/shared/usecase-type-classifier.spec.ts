/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {
  computeManualUsecaseType,
  computeUsecaseType,
  computeUsecaseTypeFromPairSupport,
  hasDirectedDataLinkSupport,
  type UsecasePairSupportResolver,
} from '../../../../../../src/application/usecase-designer/use-case-creator/shared/usecase-type-classifier.js';
import type {ManualTopology} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import {DATA_LINK_TYPE} from '../../../../../../src/domain/entities/usecase-data/links/data-link-type.js';
import type {DataLink} from '../../../../../../src/domain/entities/usecase-data/links/data-link.js';
import {USECASE_TYPE} from '../../../../../../src/domain/entities/usecase-data/usecase/usecase-type.js';

const pair = (source: number, dest: number) => ({
  sourceSubgraphSystemId: source,
  destSubgraphSystemId: dest,
});

function resolver(
  entries: Readonly<Record<string, readonly {isEc: boolean}[]>>,
): UsecasePairSupportResolver {
  return candidate =>
    entries[
      `${candidate.sourceSubgraphSystemId}->${candidate.destSubgraphSystemId}`
    ] ?? [];
}

describe('computeUsecaseTypeFromPairSupport', () => {
  it('gives EC precedence over an unrelated unsupported pair', () => {
    expect(
      computeUsecaseTypeFromPairSupport(
        [10, 15, 20, 30, 40],
        [pair(10, 15), pair(15, 20), pair(30, 40)],
        resolver({
          '10->15': [{isEc: true}],
          '15->20': [{isEc: true}],
        }),
      ),
    ).toBe(USECASE_TYPE.Ec);
  });

  it('returns ISLAND when no EC evidence exists and one pair is unsupported', () => {
    expect(
      computeUsecaseTypeFromPairSupport(
        [10, 20, 30],
        [pair(10, 20), pair(20, 30)],
        resolver({'10->20': [{isEc: false}]}),
      ),
    ).toBe(USECASE_TYPE.Island);
  });

  it('returns LINKED when every resulting pair has normal support', () => {
    expect(
      computeUsecaseTypeFromPairSupport(
        [10, 15, 20],
        [pair(10, 15), pair(15, 20)],
        resolver({
          '10->15': [{isEc: false}],
          '15->20': [{isEc: false}],
        }),
      ),
    ).toBe(USECASE_TYPE.Linked);
  });
});

describe('computeUsecaseType island rule', () => {
  const links = [
    {
      systemId: 1,
      sourceSubgraphSystemId: 10,
      destSubgraphSystemId: 20,
      linkType: DATA_LINK_TYPE.Normal,
    },
    {
      systemId: 2,
      sourceSubgraphSystemId: 20,
      destSubgraphSystemId: 30,
      linkType: DATA_LINK_TYPE.Normal,
    },
    {
      systemId: 3,
      sourceSubgraphSystemId: 30,
      destSubgraphSystemId: 40,
      linkType: DATA_LINK_TYPE.Normal,
    },
  ] as never as readonly DataLink[];

  it('stays LINKED when a control-link pair has no data support', () => {
    expect(
      computeUsecaseType(
        [10, 20, 30, 40],
        [pair(10, 20), pair(20, 30), pair(30, 40), pair(20, 40)],
        links,
      ),
    ).toBe(USECASE_TYPE.Linked);
  });

  it('returns ISLAND when a member has no data-supported pair', () => {
    expect(
      computeUsecaseType([10, 20, 50], [pair(10, 20), pair(20, 50)], links),
    ).toBe(USECASE_TYPE.Island);
  });
});

describe('computeManualUsecaseType', () => {
  it('classifies a fully data-supported topology without isolated members as LINKED', () => {
    const topology: ManualTopology = {
      pairs: [
        {
          pair: pair(10, 20),
          dataLinks: [
            {
              systemId: 1,
              sourceSubgraphSystemId: 10,
              destSubgraphSystemId: 20,
              linkType: DATA_LINK_TYPE.Normal,
            } as never,
          ],
          controlLinks: [],
        },
      ],
      isolatedSubgraphSystemIds: [],
    };

    expect(computeManualUsecaseType(topology)).toBe(USECASE_TYPE.Linked);
  });

  it('classifies control support or an isolated member as ISLAND', () => {
    const controlTopology: ManualTopology = {
      pairs: [
        {
          pair: pair(10, 20),
          dataLinks: [],
          controlLinks: [
            {
              systemId: 2,
              sourceSubgraphSystemId: 10,
              destSubgraphSystemId: 20,
            } as never,
          ],
        },
      ],
      isolatedSubgraphSystemIds: [],
    };
    const dataTopology: ManualTopology = {
      pairs: [
        {
          pair: pair(10, 20),
          dataLinks: [
            {
              systemId: 3,
              sourceSubgraphSystemId: 10,
              destSubgraphSystemId: 20,
              linkType: DATA_LINK_TYPE.Normal,
            } as never,
          ],
          controlLinks: [],
        },
      ],
      isolatedSubgraphSystemIds: [30],
    };

    expect(computeManualUsecaseType(controlTopology)).toBe(USECASE_TYPE.Island);
    expect(computeManualUsecaseType(dataTopology)).toBe(USECASE_TYPE.Island);
  });

  it('gives EC data support precedence over control support and isolated members', () => {
    const topology: ManualTopology = {
      pairs: [
        {
          pair: pair(10, 20),
          dataLinks: [
            {
              systemId: 4,
              sourceSubgraphSystemId: 10,
              destSubgraphSystemId: 20,
              linkType: DATA_LINK_TYPE.Ec,
            } as never,
          ],
          controlLinks: [],
        },
        {
          pair: pair(20, 30),
          dataLinks: [],
          controlLinks: [
            {
              systemId: 5,
              sourceSubgraphSystemId: 20,
              destSubgraphSystemId: 30,
            } as never,
          ],
        },
      ],
      isolatedSubgraphSystemIds: [40],
    };

    expect(computeManualUsecaseType(topology)).toBe(USECASE_TYPE.Ec);
  });
});

describe('hasDirectedDataLinkSupport', () => {
  const links = [
    {
      systemId: 1,
      sourceSubgraphSystemId: 10,
      destSubgraphSystemId: 20,
      linkType: DATA_LINK_TYPE.Normal,
    },
  ] as never as readonly DataLink[];

  it('is true when a data link matches the stored direction', () => {
    expect(
      hasDirectedDataLinkSupport(
        {sourceSubgraphSystemId: 10, destSubgraphSystemId: 20},
        links,
      ),
    ).toBe(true);
  });

  it('is false when the only data link runs the other way', () => {
    expect(
      hasDirectedDataLinkSupport(
        {sourceSubgraphSystemId: 20, destSubgraphSystemId: 10},
        links,
      ),
    ).toBe(false);
  });

  it('is false for a pair with no data link at all', () => {
    expect(
      hasDirectedDataLinkSupport(
        {sourceSubgraphSystemId: 20, destSubgraphSystemId: 40},
        links,
      ),
    ).toBe(false);
  });
});
