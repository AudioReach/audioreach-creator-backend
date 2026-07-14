/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {ApiIssueItem} from './api-issue-item.dto.js';

/**
 * Wire envelope for successful command / query outcomes.
 *
 * Two fields only (design §6.1):
 *   data   — the successful payload (may be omitted for void commands)
 *   issues — non-blocking (WARNING) or per-item (ERROR/FATAL for `partial`)
 *            structured issues; omitted when the outcome is a complete success
 *
 * The retired `success` / `message` fields were noise — HTTP status conveys
 * complete-vs-partial (200 vs 207) and clients can derive booleans from
 * `issues[]` if they need them. Failures no longer travel on `ApiResult` at
 * all — they surface as `ErrorResponse` via `AllExceptionsFilter`.
 */
export class ApiResult<T> {
  @ApiProperty({required: false})
  data?: T;

  @ApiProperty({type: [ApiIssueItem], required: false})
  issues?: ApiIssueItem[];
}
