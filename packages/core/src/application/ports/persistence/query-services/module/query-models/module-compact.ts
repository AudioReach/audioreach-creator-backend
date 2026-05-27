/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export class ModuleCompactView {
  constructor(
    public readonly systemId: number,
    public readonly name: string,
    public readonly alias: string,
    public readonly isEnabled: boolean,
  ) {}
}
