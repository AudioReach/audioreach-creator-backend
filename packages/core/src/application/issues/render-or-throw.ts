/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {IssueFact} from '../../domain/issues/issue-fact.js';
import {DomainRuleViolationException} from '../shared/exceptions/domain-rule-violation.exception.js';
import {RESULT_KIND, type Result} from '../shared/result/result.js';
import type {Issue} from './issue.js';
import type {IssueRenderer} from './issue-renderer.js';

/** `Result<T, I>` without its FAIL variant: a result that has data. */
export type SucceededResult<T, I> = Exclude<
  Result<T, I>,
  {readonly kind: typeof RESULT_KIND.Fail}
>;

/**
 * Renders the issues of a fact result. A FAIL result is thrown as a
 * `DomainRuleViolationException` with its rendered issues; any other result
 * is returned with its warnings rendered. Call it inside the unit of work,
 * so the identity reads see the session's changes.
 */
export async function renderOrThrow<T>(
  result: Result<T, IssueFact>,
  renderer: IssueRenderer,
): Promise<SucceededResult<T, Issue>> {
  if (result.kind === RESULT_KIND.Fail) {
    throw new DomainRuleViolationException(
      await renderer.render(result.issues),
    );
  }
  const issues = await renderer.render(result.issues ?? []);
  if (result.kind === RESULT_KIND.Partial) {
    return {kind: RESULT_KIND.Partial, data: result.data, issues};
  }
  return issues.length > 0
    ? {kind: RESULT_KIND.Ok, data: result.data, issues}
    : {kind: RESULT_KIND.Ok, data: result.data};
}
