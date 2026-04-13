/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  HIERARCHICAL_INSERT_STATUS,
  type BaseInsertError,
  type BaseEntityResult,
  type HierarchicalInsertStatusValue,
} from '@arc/core';

export abstract class BaseHierarchicalEntityResult<
  TError extends BaseInsertError,
> implements BaseEntityResult<TError> {
  protected internalErrors: TError[];
  protected internalStatus: HierarchicalInsertStatusValue;
  protected aggregateEntityInfo: string;
  protected entityInfo: string;

  constructor(aggregateDetails: string, entityDetails: string) {
    this.aggregateEntityInfo = aggregateDetails;
    this.entityInfo = entityDetails;
    this.internalErrors = [];
    this.internalStatus = HIERARCHICAL_INSERT_STATUS.unknown;
  }
  public get errors(): ReadonlyArray<TError> {
    return this.internalErrors;
  }

  public get status(): HierarchicalInsertStatusValue {
    return this.internalStatus;
  }

  public get hasErrors(): boolean {
    return this.errors.length > 0;
  }

  public set status(value: HierarchicalInsertStatusValue) {
    this.internalStatus = value;
  }

  public addError(error: TError): void {
    this.internalErrors.push(error);
  }

  public addErrors(errors: TError[]): void {
    this.internalErrors.push(...errors);
  }

  public abstract getChildren(): ReadonlyArray<BaseEntityResult<TError>>;
}
