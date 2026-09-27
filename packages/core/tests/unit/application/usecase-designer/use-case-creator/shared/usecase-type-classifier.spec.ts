/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {
  computeUsecaseTypeFromPairSupport,
  type UsecasePairSupportResolver,
} from '../../../../../../src/application/usecase-designer/use-case-creator/shared/usecase-type-classifier.js';
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
