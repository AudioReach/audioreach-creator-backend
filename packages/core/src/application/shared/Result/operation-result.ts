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

  static fail<T>(...errors: Error[]): Result<T> {
    return new Result<T>(false, undefined, errors, []);
  }

  get isFailure(): boolean {
    return !this.isSuccess;
  }

  get data(): T {
    if (!this.isSuccess || this._data === undefined) {
      throw new Error('Cannot access data from a failed result');
    }
    return this._data;
  }
}
