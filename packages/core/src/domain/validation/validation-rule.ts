/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  IssueSeverity,
  ValidationEntityType,
  ValidationIssue,
} from './issue.js';
import type {
  BaseValidationContext,
  FileValidationContext,
} from './validation-context.js';

/**
 * Validation rule groups — define which set of rules runs in each context.
 *
 * Rules declare which groups they belong to via `readonly groups`.
 * The engine filters rules by group at runtime.
 *
 * Group descriptions:
 *   FULL        — All rules; comprehensive check (file open, on-demand validate)
 *   COMMIT      — Lightweight subset; structural integrity check before commit
 *   UPLOAD_FILE — Rules specific to file upload/open
 *   SAVE_FILE   — Rules specific to file save
 *   MULTI_DSP   — Rules for multi-DSP configurations
 */
export const VALIDATION_RULE_GROUP = {
  Commit: 'COMMIT',
  UploadFile: 'UPLOAD_FILE',
  SaveFile: 'SAVE_FILE',
} as const;
export type ValidationRuleGroup =
  (typeof VALIDATION_RULE_GROUP)[keyof typeof VALIDATION_RULE_GROUP];

/**
 * Interface for a validation rule.
 *
 * Rules are typed to a specific context profile (TContext) — the subset of
 * FileValidationContext they actually need. TypeScript enforces at compile time
 * that the rule only accesses fields declared in its profile.
 *
 * The engine always passes FileValidationContext (which extends all profiles),
 * so any profile-typed rule is safely callable by the engine.
 *
 * @example
 * // Rule typed to LinkValidationContext — can only access link-related fields
 * class DuplicateDataLinkRule implements IValidationRule<LinkValidationContext> {
 *   validate(context: LinkValidationContext): ValidationIssue[] { ... }
 * }
 */
export interface ValidationRule<
  TContext extends BaseValidationContext = FileValidationContext,
> {
  readonly code: string; // Matches the issue code this rule produces
  readonly defaultSeverity: IssueSeverity;
  readonly groups: ValidationRuleGroup[]; // Which groups this rule participates in
  /**
   * Entity types this rule needs to validate.
   * Used by ValidationContextBuilder.fromDb() to load only the required DB tables,
   * avoiding unnecessary queries when running a subset of rules (e.g., COMMIT group).
   *
   * The context builder maps each entity type to its DB query and derived index maps:
   *   SpfModule           → modules + modulesBySystemId + modulesBySubgraphId
   *   DataLink            → dataLinks
   *   ControlLink         → controlLinks
   *   UseCase             → usecases + usecasesByModuleId
   *   Subgraph            → subgraphs + subgraphsBySystemId
   *   SpfModuleDefinition → definitions
   */
  readonly requiredEntityTypes: ReadonlyArray<ValidationEntityType>;
  validate(context: TContext): ValidationIssue[];
}
