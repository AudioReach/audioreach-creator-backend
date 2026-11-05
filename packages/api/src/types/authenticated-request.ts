/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Request} from 'express';

/** The caller identified by a verified access token. */
export interface AuthenticatedClient {
  clientId: string;
  clientName: string;
  userId?: string;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedClient;
}
