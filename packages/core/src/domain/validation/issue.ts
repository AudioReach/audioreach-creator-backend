/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export const IssueSeverity = {
  Fatal: 'FATAL',
  Error: 'ERROR',
  Warning: 'WARNING',
} as const;
export type IssueSeverity = (typeof IssueSeverity)[keyof typeof IssueSeverity];

export const IssueCategory = {
  Blocking: 'BLOCKING',
  NonBlocking: 'NON_BLOCKING',
  DataLoss: 'DATA_LOSS', // Data was not inserted into DB during upload
} as const;
export type IssueCategory = (typeof IssueCategory)[keyof typeof IssueCategory];

/**
 * Maps severity to BLOCKING or NON_BLOCKING.
 * DATA_LOSS is set explicitly by the insertion failure code — not derived from severity.
 */
export function deriveCategoryFromSeverity(
  severity: IssueSeverity,
): IssueCategory {
  return severity === IssueSeverity.Fatal || severity === IssueSeverity.Error
    ? IssueCategory.Blocking
    : IssueCategory.NonBlocking;
}

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
  id: string; /* e.g. delete-duplicate-link*/
  description: string;
  commandType: string;
  commandPayload: Record<string, unknown>;
  requiredClientInputs: ClientInputSpec[];
}

/**
 * Entity types that can appear in validation issues.
 * A curated subset of domain entities — only those that validation rules
 * actually validate and report issues against.
 *
 * Defined in core (not infrastructure) to keep the domain layer independent
 * of TypeORM entity names. Add new values here as rules are added.
 */
export const VALIDATION_ENTITY_TYPE = {
  SpfModule: 'SpfModule',
  DataLink: 'DataLink',
  ControlLink: 'ControlLink',
  Subgraph: 'Subgraph',
  UseCase: 'UseCase',
  Container: 'Container',
  SpfModuleDefinition: 'SpfModuleDefinition',
} as const;
export type ValidationEntityType =
  (typeof VALIDATION_ENTITY_TYPE)[keyof typeof VALIDATION_ENTITY_TYPE];

export interface ImpactedEntity {
  /** The type of entity that has the issue. */
  entityType: ValidationEntityType;
  systemId: number;
  /** Human-readable name for display (e.g., module alias). */
  displayName?: string;
}

/**
 * Ordered severity levels from least to most severe.
 * Used to validate that severity overrides are strictly escalating.
 */
export const SEVERITY_ORDER: ReadonlyArray<IssueSeverity> = [
  IssueSeverity.Warning,
  IssueSeverity.Error,
  IssueSeverity.Fatal,
] as const;

export interface ValidationIssue {
  code: string;
  name: string;
  description: string;
  defaultSeverity: IssueSeverity;
  effectiveSeverity: IssueSeverity;
  category: IssueCategory;
  fixOptions: FixOption[];
  impactedEntity: ImpactedEntity;
  impactedUsecases: number[];
}
