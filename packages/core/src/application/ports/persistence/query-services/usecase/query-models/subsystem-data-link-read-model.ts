/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export interface SubsystemDataLinkReadModel {
  readonly systemId: number;
  readonly sourceNodeSystemId: number;
  readonly destinationNodeSystemId: number;
  readonly sourcePortSystemId: number;
  readonly destinationPortSystemId: number;
  readonly dataLinkSystemId: number | null;
}
