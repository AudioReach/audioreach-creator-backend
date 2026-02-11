/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Request} from '../request.js';

/**
 * Base interface for all queries in the system
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Marker interface for CQRS queries
export interface Query extends Request {}
