/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export const REVIEWED_AT_ENTITY_TYPE = {
  UseCase: 'usecase',
  Subgraph: 'subgraph',
  Module: 'module',
} as const;

export type ReviewedAtEntityType =
  (typeof REVIEWED_AT_ENTITY_TYPE)[keyof typeof REVIEWED_AT_ENTITY_TYPE];

export interface EntityReviewedAt {
  fileSystemId: number;
  entityType: ReviewedAtEntityType;
  entitySystemId: number;
  reviewedAt: string;
}
