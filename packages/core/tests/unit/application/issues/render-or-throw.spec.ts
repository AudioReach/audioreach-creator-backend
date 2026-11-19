/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {IssueRenderer} from '../../../../src/application/issues/issue-renderer.js';
import {renderOrThrow} from '../../../../src/application/issues/render-or-throw.js';
import {DomainRuleViolationException} from '../../../../src/application/shared/exceptions/domain-rule-violation.exception.js';
import {
  Result,
  RESULT_KIND,
} from '../../../../src/application/shared/result/result.js';
import type {IssueFact} from '../../../../src/domain/issues/issue-fact.js';
import {ISSUE_CODE} from '../../../../src/shared/issues/operational-codes.js';
import {IssueSeverity} from '../../../../src/shared/issues/severity.js';

const renderer = new IssueRenderer({}, 42);

const island: IssueFact = {
  code: ISSUE_CODE.ROUTING_ISLAND_DETECTED,
  severity: IssueSeverity.Warning,
  impactedEntity: {
    entityType: 'Subgraph',
    systemId: 5,
    identity: {name: 'Mic in', naturalId: 5},
  },
};
const islandMessage =
  "Subgraph 'Mic in' (0x00000005) has no data links to other subgraphs " +
  'in its use case.';

describe('renderOrThrow', () => {
  it('throws a domain rule violation with the rendered issues on failure', async () => {
    const error = await renderOrThrow(Result.fail(island), renderer).catch(
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(DomainRuleViolationException);
    expect((error as DomainRuleViolationException).issues).toEqual([
      expect.objectContaining({message: islandMessage}),
    ]);
  });

  it('returns the data with rendered warnings', async () => {
    const result = await renderOrThrow(Result.ok('data', [island]), renderer);

    expect(result).toEqual({
      kind: RESULT_KIND.Ok,
      data: 'data',
      issues: [expect.objectContaining({message: islandMessage})],
    });
  });

  it('returns a partial result with its issues rendered', async () => {
    const result = await renderOrThrow(
      Result.partial('data', [island]),
      renderer,
    );

    expect(result).toEqual({
      kind: RESULT_KIND.Partial,
      data: 'data',
      issues: [expect.objectContaining({message: islandMessage})],
    });
  });

  it('returns the data without an issues field when there are none', async () => {
    const result = await renderOrThrow(Result.ok('data'), renderer);

    expect(result).toEqual({kind: RESULT_KIND.Ok, data: 'data'});
  });
});
