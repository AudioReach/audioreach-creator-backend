/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import noBannedKeywords from './no-banned-keywords.js';
import noApiPropertyExample from './no-api-property-example.js';

export default {
  rules: {
    'no-banned-keywords': noBannedKeywords,
    'no-api-property-example': noApiPropertyExample,
  },
};
