/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export const CLIENT_INPUT_TYPE = {
  Number: 'NUMBER',
  String: 'STRING',
  Boolean: 'BOOLEAN',
} as const;
export type ClientInputType =
  (typeof CLIENT_INPUT_TYPE)[keyof typeof CLIENT_INPUT_TYPE];

export interface ClientInputSpec {
  /**
   * The key in `commandPayload` that the client must fill in.
   * This field is currently `null` in the payload — the client prompts the user
   * and sets this value before calling POST /apply-fix.
   * Example: "sourceModuleInstanceId"
   */
  field: string;

  /**
   * Human-readable label shown to the user in the UI prompt.
   * Example: "Provide source module instance ID"
   */
  label: string;

  /**
   * The input type to render in the UI — determines what kind of value to collect.
   * NUMBER → numeric input, STRING → text input, BOOLEAN → checkbox/toggle.
   */
  type: ClientInputType;
}

export interface FixOption {
  /** e.g. "delete-duplicate-link" */
  id: string;
  description: string;
  commandType: string;
  commandPayload: Record<string, unknown>;
  requiredClientInputs: ClientInputSpec[];
}
