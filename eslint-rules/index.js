/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {createRequire} from 'module';
import noBannedKeywords from './no-banned-keywords.js';
import noApiPropertyExample from './no-api-property-example.js';

const require = createRequire(import.meta.url);
const noManualStatusCodes = require('./no-manual-status-codes.cjs');
const noControllerTryCatch = require('./no-controller-try-catch.cjs');
const enforceHttpExceptions = require('./enforce-http-exceptions.cjs');
const noRawPersistenceQueries = require('./no-raw-persistence-queries.cjs');
const noDomainInfrastructureDeps = require('./no-domain-infrastructure-deps.cjs');
const enforceCreateZodDtoNaming = require('./enforce-createzodto-naming.cjs');

export default {
  rules: {
    'no-banned-keywords': noBannedKeywords,
    'no-api-property-example': noApiPropertyExample,
    'no-manual-status-codes': noManualStatusCodes,
    'no-controller-try-catch': noControllerTryCatch,
    'enforce-http-exceptions': enforceHttpExceptions,
    'no-domain-infrastructure-deps': noDomainInfrastructureDeps,
    'no-raw-persistence-queries': noRawPersistenceQueries,
    'enforce-createzodto-naming': enforceCreateZodDtoNaming,
  },
};
