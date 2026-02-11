/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export interface ControlLinkReadModel {
  readonly systemId: number;
  readonly peerNodeASystemId: number;
  readonly peerNodeBSystemId: number;
  readonly nodeAPortSystemId: number;
  readonly nodeBPortSystemId: number;
  readonly heapId: number;
  readonly isInterGraph: boolean;
}
