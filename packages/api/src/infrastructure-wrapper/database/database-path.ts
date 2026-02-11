/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as os from 'node:os';
import path from 'node:path';

export function getDatabasePath(/*configService: ConfigService*/): string {
  //   const dbPath = configService.get<string>('DATABASE_PATH');
  //   if (dbPath) {
  //     return dbPath;
  //   }

  // Cross-platform default paths
  const appName = 'audioreach-creator';
  const platform = os.platform();

  switch (platform) {
    case 'win32': {
      return path.join(
        os.homedir(),
        'AppData',
        'Local',
        appName,
        'database.db',
      );
    }
    case 'darwin': {
      return path.join(
        os.homedir(),
        'Library',
        'Application Support',
        appName,
        'database.db',
      );
    }
    default: {
      // linux
      return path.join(os.homedir(), '.local', 'share', appName, 'database.db');
    }
  }
}
