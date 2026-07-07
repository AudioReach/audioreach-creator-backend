/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export type Error = {
  code?: string;
  message: string;
};

export type Warning = {
  code?: string;
  message: string;
};

export class Result<T> {
  private constructor(
    public readonly isSuccess: boolean,
    private readonly _data?: T,
    public readonly errors: Error[] = [],
    public readonly warnings: Warning[] = [],
  ) {}

  static ok<T>(data: T, warnings: Warning[] = []): Result<T> {
    return new Result<T>(true, data, [], warnings);
  }

  /**
   * Partial success — usable data was produced, but some individual items
   * in a batch failed independently. isSuccess is true (data is usable) but
   * errors is non-empty, naming which items failed and why. Distinct from
   * Result.ok (no errors) and Result.fail (no data at all).
   *
   * Use for batch/array processing: wrap each item's build in its own
   * try/catch, push a failed item's exception here as an Error, and continue
   * processing the rest. The item is dropped from data, its failure is
   * recorded here.
   */
  static partial<T>(data: T, errors: Error[]): Result<T> {
    return new Result<T>(true, data, errors, []);
  }

  static fail<T>(...errors: Error[]): Result<T> {
    return new Result<T>(false, undefined, errors, []);
  }

  get isFailure(): boolean {
    return !this.isSuccess;
  }

  /** True only when the result succeeded with no per-item failures. */
  get isComplete(): boolean {
    return this.isSuccess && this.errors.length === 0;
  }

  get data(): T {
    if (!this.isSuccess || this._data === undefined) {
      throw new Error('Cannot access data from a failed result');
    }
    return this._data;
  }
}
