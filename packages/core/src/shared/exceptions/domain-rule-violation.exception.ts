/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Issue} from '../issues/issue.js';
import {IssueSeverity} from '../issues/severity.js';
import {DomainException} from './domain-exception.js';

/**
 * Thrown by domain handlers when one or more business rules are violated.
 *
 * Maps to HTTP 422 Unprocessable Entity via AllExceptionsFilter.
 * Carries structured Issue objects so the client knows exactly what failed
 * and which entities are affected — e.g. one issue per blocked port.
 *
 * Use this instead of NestJS's UnprocessableEntityException so handlers in
 * @arc/core remain framework-free.
 *
 * @example
 * throw new DomainRuleViolationException([
 *   IssueFactory.portCountDecreaseBlocked(portId, entityType, linkIds),
 * ]);
 */
export class DomainRuleViolationException extends DomainException {
  readonly errorCode = 'DOMAIN_RULE_VIOLATION';

  constructor(issues: readonly Issue[]);
  constructor(summaryMessage: string, detailMessages?: readonly string[]);

  constructor(
    issuesOrSummary: readonly Issue[] | string,
    detailMessages: readonly string[] = [],
  ) {
    let issues: readonly Issue[];
    let message: string;

    if (typeof issuesOrSummary === 'string') {
      message = issuesOrSummary;
      issues = detailMessages.map(detailMessage => ({
        code: 'DOMAIN_RULE_VIOLATION',
        message: detailMessage,
        severity: IssueSeverity.Error,
      }));
    } else {
      issues = issuesOrSummary;
      message = issues[0]?.message ?? 'Domain rule violation';
    }

    super(message, undefined, issues);
  }
}
