/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseCommand} from '../../../shared/base-command.js';
import {
  DATA_LINK_TYPE,
  type DataLinkType,
} from '../../../../domain/entities/usecase-data/links/data-link-type.js';

export class CreateDataLinkCommand extends BaseCommand {
  constructor(
    public readonly linkType: DataLinkType = DATA_LINK_TYPE.Normal,
    public readonly sourceModuleSystemId: string,
    public readonly sourcePortSystemId: string,
    public readonly destinationModuleSystemId: string,
    public readonly destinationPortSystemId: string,
  ) {
    super();
  }
}
