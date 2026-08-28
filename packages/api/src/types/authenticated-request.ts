/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Request} from 'express';

export interface AuthenticatedRequest extends Request {
  user: {clientId: string; userId?: string};
}
