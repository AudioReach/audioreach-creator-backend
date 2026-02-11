/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {DataSource} from 'typeorm';
import {NodeBlobBytesConverter} from './node-blob-converter.js';
import {getAllEntitySchemas} from '@arc/persistence';

export default new DataSource({
  type: 'sqlite',
  database: 'tmp/migration-gen.db', // ephemeral file used for diffing
  entities: getAllEntitySchemas(new NodeBlobBytesConverter()),
  migrations: [],
  synchronize: false,
});
