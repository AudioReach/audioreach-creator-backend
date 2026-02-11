/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export interface DataPortReadModel {
  readonly systemId: number;
  readonly portId: number;
  readonly name: string;
  readonly portIoType: string;
  readonly isStatic: boolean;
}
