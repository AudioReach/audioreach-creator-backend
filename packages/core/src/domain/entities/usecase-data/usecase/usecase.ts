import type {KvData} from 'domain/entities/common/entities/kv-data.js';

/**
 * Exception thrown when attempting to add a duplicate module systemId to a UseCase.
 */
export class DuplicateModuleSystemIdException extends Error {
  constructor(systemId: number) {
    super(`Module systemId ${systemId} already exists in this UseCase`);
  }
}

/**
 * Exception thrown when attempting to add a duplicate data link systemId to a UseCase.
 */
export class DuplicateDataLinkSystemIdException extends Error {
  constructor(systemId: number) {
    super(`Data link systemId ${systemId} already exists in this UseCase`);
  }
}

/**
 * Exception thrown when attempting to add a duplicate control link systemId to a UseCase.
 */
export class DuplicateControlLinkSystemIdException extends Error {
  constructor(systemId: number) {
    super(`Control link systemId ${systemId} already exists in this UseCase`);
  }
}

export interface UseCaseInit {
  systemId: number;
  fileSystemId: number;
  gkv: KvData;
  alias?: string;
  aliasId?: number;
  categories: string[];
}

export class UseCase {
  readonly systemId: number;
  readonly fileSystemId: number;
  readonly moduleSystemIds: number[] = [];
  readonly dataLinkSystemIds: number[] = [];
  readonly controlLinkSystemIds: number[] = [];

  alias?: string;
  aliasId?: number;
  categories: string[];

  constructor(initParams: UseCaseInit) {
    this.systemId = initParams.systemId;
    this.fileSystemId = initParams.fileSystemId;
    this.alias = initParams.alias;
    this.aliasId = initParams.aliasId;
    this.categories = initParams.categories;
  }

  /**
   * Adds a module systemId to the UseCase.
   * Throws DuplicateModuleSystemIdException if the systemId already exists.
   *
   * @param systemId - The module systemId to add
   * @throws {DuplicateModuleSystemIdException} When systemId already exists
   *
   * @example
   * ```typescript
   * const useCase = new UseCase(initParams);
   * useCase.addModuleSystemId(123); // Success
   * useCase.addModuleSystemId(123); // Throws DuplicateModuleSystemIdException
   * ```
   */
  addModuleSystemId(systemId: number): void {
    if (this.moduleSystemIds.includes(systemId)) {
      throw new DuplicateModuleSystemIdException(systemId);
    }
    this.moduleSystemIds.push(systemId);
  }

  /**
   * Adds multiple module systemIds to the UseCase.
   * Throws DuplicateModuleSystemIdException if any systemId already exists.
   *
   * @param systemIds - Array of module systemIds to add
   * @throws {DuplicateModuleSystemIdException} When any systemId already exists
   *
   * @example
   * ```typescript
   * const useCase = new UseCase(initParams);
   * useCase.addModuleSystemIds([123, 456, 789]); // Success
   * useCase.addModuleSystemIds([999, 123]); // Throws DuplicateModuleSystemIdException for 123
   * ```
   */
  addModuleSystemIds(systemIds: number[]): void {
    for (const systemId of systemIds) {
      this.addModuleSystemId(systemId);
    }
  }

  /**
   * Adds a data link systemId to the UseCase.
   * Throws DuplicateDataLinkSystemIdException if the systemId already exists.
   *
   * @param systemId - The data link systemId to add
   * @throws {DuplicateDataLinkSystemIdException} When systemId already exists
   *
   * @example
   * ```typescript
   * const useCase = new UseCase(initParams);
   * useCase.addDataLinkSystemId(456); // Success
   * useCase.addDataLinkSystemId(456); // Throws DuplicateDataLinkSystemIdException
   * ```
   */
  addDataLinkSystemId(systemId: number): void {
    if (this.dataLinkSystemIds.includes(systemId)) {
      throw new DuplicateDataLinkSystemIdException(systemId);
    }
    this.dataLinkSystemIds.push(systemId);
  }

  /**
   * Adds multiple data link systemIds to the UseCase.
   * Throws DuplicateDataLinkSystemIdException if any systemId already exists.
   *
   * @param systemIds - Array of data link systemIds to add
   * @throws {DuplicateDataLinkSystemIdException} When any systemId already exists
   *
   * @example
   * ```typescript
   * const useCase = new UseCase(initParams);
   * useCase.addDataLinkSystemIds([456, 789, 101]); // Success
   * useCase.addDataLinkSystemIds([999, 456]); // Throws DuplicateDataLinkSystemIdException for 456
   * ```
   */
  addDataLinkSystemIds(systemIds: number[]): void {
    for (const systemId of systemIds) {
      this.addDataLinkSystemId(systemId);
    }
  }

  /**
   * Adds a control link systemId to the UseCase.
   * Throws DuplicateControlLinkSystemIdException if the systemId already exists.
   *
   * @param systemId - The control link systemId to add
   * @throws {DuplicateControlLinkSystemIdException} When systemId already exists
   *
   * @example
   * ```typescript
   * const useCase = new UseCase(initParams);
   * useCase.addControlLinkSystemId(789); // Success
   * useCase.addControlLinkSystemId(789); // Throws DuplicateControlLinkSystemIdException
   * ```
   */
  addControlLinkSystemId(systemId: number): void {
    if (this.controlLinkSystemIds.includes(systemId)) {
      throw new DuplicateControlLinkSystemIdException(systemId);
    }
    this.controlLinkSystemIds.push(systemId);
  }

  /**
   * Adds multiple control link systemIds to the UseCase.
   * Throws DuplicateControlLinkSystemIdException if any systemId already exists.
   *
   * @param systemIds - Array of control link systemIds to add
   * @throws {DuplicateControlLinkSystemIdException} When any systemId already exists
   *
   * @example
   * ```typescript
   * const useCase = new UseCase(initParams);
   * useCase.addControlLinkSystemIds([789, 101, 202]); // Success
   * useCase.addControlLinkSystemIds([999, 789]); // Throws DuplicateControlLinkSystemIdException for 789
   * ```
   */
  addControlLinkSystemIds(systemIds: number[]): void {
    for (const systemId of systemIds) {
      this.addControlLinkSystemId(systemId);
    }
  }

  /**
   * Checks if a module systemId exists in the UseCase.
   *
   * @param systemId - The module systemId to check
   * @returns True if the systemId exists, false otherwise
   */
  hasModuleSystemId(systemId: number): boolean {
    return this.moduleSystemIds.includes(systemId);
  }

  /**
   * Checks if a data link systemId exists in the UseCase.
   *
   * @param systemId - The data link systemId to check
   * @returns True if the systemId exists, false otherwise
   */
  hasDataLinkSystemId(systemId: number): boolean {
    return this.dataLinkSystemIds.includes(systemId);
  }

  /**
   * Checks if a control link systemId exists in the UseCase.
   *
   * @param systemId - The control link systemId to check
   * @returns True if the systemId exists, false otherwise
   */
  hasControlLinkSystemId(systemId: number): boolean {
    return this.controlLinkSystemIds.includes(systemId);
  }
}
