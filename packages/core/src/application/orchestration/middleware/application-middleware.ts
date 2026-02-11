/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Request} from '../cqrs/request.js';
/*
 * Basic interface all behaviors that are called before commands/queries are executed
 */
export interface ApplicationMiddleware<T extends Request> {
  handle<TResponse>(
    request: T,
    next: () => Promise<TResponse>,
  ): Promise<TResponse>;
}
