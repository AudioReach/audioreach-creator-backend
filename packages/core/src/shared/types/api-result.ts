/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  IssueSeverity,
  IssueCategory,
  ValidationEntityType,
  ClientInputType,
} from '../../domain/validation/issue.js';

export interface ResultFixOption {
  id: string;
  description: string;
  commandType: string;
  commandPayload: Record<string, unknown>;
  requiredClientInputs: ResultClientInputSpec[];
}

export interface ResultClientInputSpec {
  field: string;
  label: string;
  type: ClientInputType;
}

/**
 * Unified issue type for command/query results — covers both domain validation
 * issues and operational failures (parse errors, bulk item failures).
 *
 * Operational failures populate only {code, message, severity}.
 * ValidationIssue-sourced items populate all fields.
 *
 * Compatible with API-layer ApiIssueItem DTO via structural typing.
 */
export interface ResultIssue {
  code: string;
  message: string;
  severity: IssueSeverity;
  category?: IssueCategory;
  impactedEntity?: {
    entityType: ValidationEntityType;
    systemId: number;
    displayName?: string;
  };
  impactedUsecases?: number[];
  fixOptions?: ResultFixOption[];
}
