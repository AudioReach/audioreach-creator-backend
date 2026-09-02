/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {LinkType} from '../../../../../domain/entities/usecase-data/links/link-type.js';

export const CONNECTION_TYPE = {
  ModuleModule: 'MODULE_MODULE',
  ModuleSubsystem: 'MODULE_SUBSYSTEM',
  SubsystemModule: 'SUBSYSTEM_MODULE',
  SubsystemSubsystem: 'SUBSYSTEM_SUBSYSTEM',
} as const;

export type ConnectionType = typeof CONNECTION_TYPE[keyof typeof CONNECTION_TYPE];

export interface ControlLinkReadModel {
  readonly systemId: number;
  readonly peerNodeASystemId: number;
  readonly peerNodeBSystemId: number;
  readonly nodeAPortSystemId: number;
  readonly nodeBPortSystemId: number;
  readonly heapId: number;
  readonly linkType: LinkType;
  readonly connectionType: ConnectionType;
  readonly isInterUsecase: boolean;
  readonly parentId: number | null;
}
