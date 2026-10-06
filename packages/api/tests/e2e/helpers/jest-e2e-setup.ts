/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';

// Embedded Nest application setup can exceed Jest's five-second default.
jest.setTimeout(120_000);
