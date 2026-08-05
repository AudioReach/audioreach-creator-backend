/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {DataSource} from 'typeorm';
import {getLoggingOrmBase} from '@arc/logger';

export default new DataSource({
  type: 'sqlite',
  database: 'tmp/logging-migration-gen.db', // ephemeral file used for diffing
  ...getLoggingOrmBase(),
  migrations: [],
});
