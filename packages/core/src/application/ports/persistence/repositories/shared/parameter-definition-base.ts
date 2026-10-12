/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export interface ParameterDefinitionBase {
  systemId: number;
  naturalId: number;
  name: string;
  description?: string;
  elementsStructure: string; // JSON — parsed by serializeParameterData
}
