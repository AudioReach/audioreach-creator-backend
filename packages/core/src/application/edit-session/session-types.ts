/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {SessionMode} from '../shared/change-vocabulary.js';

/**
 * Return payload for StartSessionHandler and EndSessionHandler.
 * Matches the shape expected by SessionResponseDto in @arc/api.
 */
export type SessionResult = {
  sessionId: number;
  projectId: string;
  sessionMode: SessionMode;
  summary: string;
};
