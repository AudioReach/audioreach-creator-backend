/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ErrorCode} from '../../../../shared/errors/error-codes.js';

/**
 * Issue severity levels
 */
export const ISSUE_SEVERITY = {
  ERROR: 'error',
  WARNING: 'warning',
} as const;

export type IssueSeverity =
  (typeof ISSUE_SEVERITY)[keyof typeof ISSUE_SEVERITY];

/**
 * Entity types that can have issues
 */
export const ENTITY_TYPES = {
  KEY_DEFINITION: 'KeyDefinition',
  VALUE_DEFINITION: 'ValueDefinition',
  SPF_MODULE_DEFINITION: 'SpfModuleDefinition',
  SUBGRAPH: 'Subgraph',
  CONTAINER: 'Container',
  SPF_MODULE: 'SpfModule',
  DATA_LINK: 'DataLink',
  CONTROL_LINK: 'ControlLink',
  USECASE: 'UseCase',
} as const;

export type EntityType = (typeof ENTITY_TYPES)[keyof typeof ENTITY_TYPES];

/**
 * Represents an issue (error or warning) that occurred during entity building or insertion
 */
export interface EntityBuildIssue {
  severity: IssueSeverity;
  code: ErrorCode;
  message: string;
  entityType: EntityType;
  entityData?: string; // JSON string for insertion errors
}

/**
 * Result of building entities with issue collection
 */
export interface BuildResult<T> {
  entities: T[];
  issues: EntityBuildIssue[];
  successCount: number;
  errorCount: number;
  warningCount: number;
}

/**
 * Collects issues (errors and warnings) during the upload process
 */
export class IssueCollector {
  private issues: EntityBuildIssue[] = [];

  addIssue(issue: EntityBuildIssue): void {
    this.issues.push(issue);
  }

  addIssues(issues: EntityBuildIssue[]): void {
    this.issues.push(...issues);
  }

  /**
   * Convenience method to add an error with automatic severity
   */
  addError(error: Omit<EntityBuildIssue, 'severity'>): void {
    this.addIssue({...error, severity: ISSUE_SEVERITY.ERROR});
  }

  /**
   * Convenience method to add a warning with automatic severity
   */
  addWarning(warning: Omit<EntityBuildIssue, 'severity'>): void {
    this.addIssue({...warning, severity: ISSUE_SEVERITY.WARNING});
  }

  getIssues(): EntityBuildIssue[] {
    return [...this.issues];
  }

  getErrors(): EntityBuildIssue[] {
    return this.issues.filter(i => i.severity === ISSUE_SEVERITY.ERROR);
  }

  getWarnings(): EntityBuildIssue[] {
    return this.issues.filter(i => i.severity === ISSUE_SEVERITY.WARNING);
  }

  hasIssues(): boolean {
    return this.issues.length > 0;
  }

  hasErrors(): boolean {
    return this.getErrors().length > 0;
  }

  hasWarnings(): boolean {
    return this.getWarnings().length > 0;
  }

  getIssueCount(): number {
    return this.issues.length;
  }

  getErrorCount(): number {
    return this.getErrors().length;
  }

  getWarningCount(): number {
    return this.getWarnings().length;
  }

  clear(): void {
    this.issues = [];
  }

  /**
   * Format issues for API response
   */
  formatForApi(): {errors?: string[]; warnings?: string[]} {
    const errors = this.getErrors().map(
      err => `[${err.code}] ${err.entityType}: ${err.message}`,
    );
    const warnings = this.getWarnings().map(
      warn => `[${warn.code}] ${warn.entityType}: ${warn.message}`,
    );

    return {
      ...(errors.length > 0 && {errors}),
      ...(warnings.length > 0 && {warnings}),
    };
  }
}
