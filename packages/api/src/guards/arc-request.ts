/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Request} from 'express';
import type {ActiveSession} from '@arc/core';

/** Express request augmented with the active session resolved by SessionGuard. */
export type ArcRequest = Request & {arcSession?: ActiveSession};
