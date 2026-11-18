/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {LegacyIssue, IssueSeverity} from '../../shared/issues/index.js';

/**
 * Rule-produced issue extending the base LegacyIssue vocabulary.
 *
 * Fields inherited from LegacyIssue:
 *   code, message, severity, category?, impactedEntity?,
 *   impactedUsecases?, fixOptions?
 *
 * Rules populate every base field unconditionally (though they are optional
 * on the base type to accommodate operational Issues that do not have them).
 */
export interface ValidationIssue extends LegacyIssue {
  /** Rule name — e.g. "Missing Module Definition". Only meaningful for rule outputs. */
  name: string;
  /** Rule's built-in severity before user preferences applied. Internal only — never on the wire. */
  defaultSeverity: IssueSeverity;
}
