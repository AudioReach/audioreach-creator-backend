/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseCommand} from '../../shared/base-command.js';
import type {PathRef} from '../shared/utils/file-ref.js';

export class OpenFileCommand extends BaseCommand {
  constructor(
    clientId: string,
    public readonly acdb: PathRef,
    public readonly awsp: PathRef,
  ) {
    super(clientId);
  }
}
