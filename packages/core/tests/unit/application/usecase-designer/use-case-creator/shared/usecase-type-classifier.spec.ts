/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {
  computeManualUsecaseType,
  computeUsecaseTypeFromPairSupport,
  type UsecasePairSupportResolver,
} from '../../../../../../src/application/usecase-designer/use-case-creator/shared/usecase-type-classifier.js';
import type {ManualTopology} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import {DATA_LINK_TYPE} from '../../../../../../src/domain/entities/usecase-data/links/data-link-type.js';
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
        [pair(10, 20), pair(20, 30)],
        resolver({'10->20': [{isEc: false}]}),
      ),
    ).toBe(USECASE_TYPE.Island);
  });

  it('returns LINKED when every resulting pair has normal support', () => {
    expect(
      computeUsecaseTypeFromPairSupport(
        [pair(10, 15), pair(15, 20)],
        resolver({
          '10->15': [{isEc: false}],
          '15->20': [{isEc: false}],
        }),
      ),
    ).toBe(USECASE_TYPE.Linked);
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
    };

    expect(computeManualUsecaseType(topology, [])).toBe(USECASE_TYPE.Linked);
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
    };

    expect(computeManualUsecaseType(controlTopology, [])).toBe(
      USECASE_TYPE.Island,
    );
    expect(computeManualUsecaseType(dataTopology, [30])).toBe(
      USECASE_TYPE.Island,
    );
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
    };

    expect(computeManualUsecaseType(topology, [40])).toBe(USECASE_TYPE.Ec);
  });
});
