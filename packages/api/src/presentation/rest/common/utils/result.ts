import {AsyncResult, ErrorCode} from './enums.js';

export class BaseResult {
  private _success: boolean;
  private _message: string;
  private _errorCode: ErrorCode;

  get success(): boolean {
    return this._success;
  }

  get message(): string {
    return this._message;
  }

  get errorCode(): ErrorCode {
    return this._errorCode;
  }

  protected constructor(
    success: boolean,
    errorMessage: string,
    errorCode: ErrorCode,
  ) {
    if (
      (success && errorCode !== ErrorCode.None) ||
      (!success && errorCode === ErrorCode.None)
    ) {
      throw new Error(
        'Invalid operation: Success and ErrorCode are inconsistent',
      );
    }
    this._success = success;
    this._message = errorMessage;
    this._errorCode = errorCode;
  }

  static getFail(
    message: string,
    errorCode: ErrorCode = ErrorCode.GeneralFailure,
  ): BaseResult {
    return new BaseResult(false, message, errorCode);
  }

  static getSuccess(message: string = ''): BaseResult {
    return new BaseResult(true, message, ErrorCode.None);
  }
}

/**
 * Converted from C# class Result<T>
 */
export class Result<T> extends BaseResult {
  private _value: T;

  get value(): T {
    return this._value;
  }

  set value(value: T) {
    this._value = value;
  }

  constructor(
    value: T,
    success: boolean,
    errorMessage: string,
    errorCode: ErrorCode,
  ) {
    super(success, errorMessage, errorCode);
    this._value = value;
  }
}

/**
 * Factory methods for Result<T>
 */
export const ResultFactory = {
  getFail<T>(
    valueOrMessage: T | string,
    messageOrErrorCode?: string | ErrorCode,
    errorCode?: ErrorCode,
  ): Result<T> {
    return typeof valueOrMessage === 'string'
      ? new Result<T>(
          undefined as unknown as T,
          false,
          valueOrMessage,
          (messageOrErrorCode as ErrorCode) || ErrorCode.GeneralFailure,
        )
      : new Result<T>(
          valueOrMessage,
          false,
          messageOrErrorCode as string,
          errorCode || ErrorCode.GeneralFailure,
        );
  },

  getSuccess<T>(value: T, message: string = ''): Result<T> {
    return new Result<T>(value, true, message, ErrorCode.None);
  },

  getFailAsync<T>(
    asyncResult: AsyncResult,
    message: string,
    errorCode: ErrorCode = ErrorCode.GeneralFailure,
  ): ResultAsync<T> {
    return new ResultAsync<T>(
      undefined as unknown as T,
      false,
      asyncResult,
      message,
      errorCode,
    );
  },

  getSuccessAsync<T>(
    value: T,
    asyncResult: AsyncResult,
    message: string = '',
  ): ResultAsync<T> {
    return new ResultAsync<T>(
      value,
      true,
      asyncResult,
      message,
      ErrorCode.None,
    );
  },
} as const;

/**
 * Converted from C# class ResultAsync<T>
 */
export class ResultAsync<T> extends Result<T> {
  private _asyncResult: AsyncResult;

  get asyncResult(): AsyncResult {
    return this._asyncResult;
  }

  set asyncResult(value: AsyncResult) {
    this._asyncResult = value;
  }

  constructor(
    value: T,
    success: boolean,
    errorMessage: string,
    errorCode: ErrorCode,
  );
  constructor(
    value: T,
    success: boolean,
    asyncResult: AsyncResult,
    errorMessage: string,
    errorCode: ErrorCode,
  );
  constructor(
    value: T,
    success: boolean,
    asyncResultOrErrorMessage: AsyncResult | string,
    errorMessageOrErrorCode: string | ErrorCode,
    errorCode?: ErrorCode,
  ) {
    if (typeof asyncResultOrErrorMessage === 'string') {
      super(
        value,
        success,
        asyncResultOrErrorMessage,
        errorMessageOrErrorCode as ErrorCode,
      );
      this._asyncResult = AsyncResult.Completed; // Default value
    } else {
      super(
        value,
        success,
        errorMessageOrErrorCode,
        errorCode || ErrorCode.GeneralFailure,
      );
      this._asyncResult = asyncResultOrErrorMessage;
    }
  }
}

/**
 * Converted from C# class SetModuleDataResult
 */
export class SetModuleDataResult extends BaseResult {
  private _pidToSetResultMap: ReadonlyMap<number, BaseResult>;

  get pidToSetResultMap(): ReadonlyMap<number, BaseResult> {
    return this._pidToSetResultMap;
  }

  constructor(
    success: boolean,
    errorMessage?: string,
    errorCode: ErrorCode = ErrorCode.None,
    pidToSetResultMap?: Map<number, BaseResult>,
  ) {
    super(success, errorMessage || '', errorCode);
    this._pidToSetResultMap =
      pidToSetResultMap || new Map<number, BaseResult>();
  }
}

/**
 * Converted from C# class SetModuleDataResultAsync
 */
export class SetModuleDataResultAsync extends ResultAsync<boolean> {
  private _pidToSetResultMap: ReadonlyMap<number, ResultAsync<boolean>>;

  get pidToSetResultMap(): ReadonlyMap<number, ResultAsync<boolean>> {
    return this._pidToSetResultMap;
  }

  constructor(
    success: boolean,
    asyncResult: AsyncResult,
    errorMessage?: string,
    errorCode: ErrorCode = ErrorCode.None,
    pidToSetResultMap?: Map<number, ResultAsync<boolean>>,
  ) {
    super(true, success, asyncResult, errorMessage || '', errorCode);
    this._pidToSetResultMap =
      pidToSetResultMap || new Map<number, ResultAsync<boolean>>();
  }
}
