import type {IDefinitionBulkInsert} from './definition-bulk-insert.interface.js';
import type {
  KeyDefinition,
  TagDefinition,
  SpfPropertyDefinition,
  DriverPropertyDefinition,
  SpfModuleDefinition,
  DriverModuleDefinition,
} from '../../../shared/awsp-serializers/v1/definitions/index.js';

/**
 * Repository interface for database operations
 * This should be implemented by the infrastructure layer
 */
export interface IDefinitionRepository {
  /**
   * Bulk insert records into the database
   * @param data - Array of domain objects to insert
   * @returns Promise resolving to an array of inserted record IDs
   */
  bulkInsert<T>(data: T[]): Promise<number[]>;
}

/**
 * Service for bulk inserting definitions into the database
 */
export class DefinitionBulkInsertService implements IDefinitionBulkInsert {
  constructor(private readonly repository: IDefinitionRepository) {}

  /**
   * Generic method to perform bulk insert with validation
   * @param definitions - Array of domain objects to insert
   * @param definitionType - Human-readable name for error messages
   * @returns Promise resolving to an array of inserted record IDs
   */
  private async bulkInsert<T>(
    definitions: T[],
    definitionType: string,
  ): Promise<number[]> {
    if (!definitions || definitions.length === 0) {
      throw new Error(`No ${definitionType} provided for bulk insert`);
    }

    try {
      const ids = await this.repository.bulkInsert(definitions);
      return ids;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(
          `Failed to bulk insert ${definitionType}: ${error.message}`,
        );
      }
      throw new Error(`Failed to bulk insert ${definitionType}: Unknown error`);
    }
  }

  /**
   * Bulk insert key definitions
   * @param definitions - Array of key definitions to insert
   * @returns Promise resolving to an array of system IDs of inserted records
   */
  async insertKeyDefinitions(definitions: KeyDefinition[]): Promise<number[]> {
    if (definitions == null) {
      throw new Error('Key definitions cannot be null or undefined');
    }

    // TODO: Add custom mapping logic from KeyDefinition DTO to domain object
    // This is not a straight mapping - implement business logic here
    const domainObjects = definitions.map(dto => {
      // Custom mapping logic goes here
      return dto; // Placeholder - replace with actual domain object
    });

    return this.bulkInsert(domainObjects, 'key definitions');
  }

  /**
   * Bulk insert tag definitions
   * @param definitions - Array of tag definitions to insert
   * @returns Promise resolving to an array of system IDs of inserted records
   */
  async insertTagDefinitions(definitions: TagDefinition[]): Promise<number[]> {
    if (definitions == null) {
      throw new Error('Tag definitions cannot be null or undefined');
    }

    // TODO: Add custom mapping logic from TagDefinition DTO to domain object
    // This is not a straight mapping - implement business logic here
    const domainObjects = definitions.map(dto => {
      // Custom mapping logic goes here
      return dto; // Placeholder - replace with actual domain object
    });

    return this.bulkInsert(domainObjects, 'tag definitions');
  }

  /**
   * Bulk insert SPF property definitions
   * @param definitions - Array of SPF property definitions to insert
   * @returns Promise resolving to an array of system IDs of inserted records
   */
  async insertSpfPropertyDefinitions(
    definitions: SpfPropertyDefinition[],
  ): Promise<number[]> {
    if (definitions == null) {
      throw new Error('SPF property definitions cannot be null or undefined');
    }

    // TODO: Add custom mapping logic from SpfPropertyDefinition DTO to domain object
    // This is not a straight mapping - implement business logic here
    const domainObjects = definitions.map(dto => {
      // Custom mapping logic goes here
      return dto; // Placeholder - replace with actual domain object
    });

    return this.bulkInsert(domainObjects, 'SPF property definitions');
  }

  /**
   * Bulk insert driver property definitions
   * @param definitions - Array of driver property definitions to insert
   * @returns Promise resolving to an array of system IDs of inserted records
   */
  async insertDriverPropertyDefinitions(
    definitions: DriverPropertyDefinition[],
  ): Promise<number[]> {
    if (definitions == null) {
      throw new Error(
        'Driver property definitions cannot be null or undefined',
      );
    }

    // TODO: Add custom mapping logic from DriverPropertyDefinition DTO to domain object
    // This is not a straight mapping - implement business logic here
    const domainObjects = definitions.map(dto => {
      // Custom mapping logic goes here
      return dto; // Placeholder - replace with actual domain object
    });

    return this.bulkInsert(domainObjects, 'driver property definitions');
  }

  /**
   * Bulk insert SPF module definitions
   * @param definitions - Array of SPF module definitions to insert
   * @returns Promise resolving to an array of system IDs of inserted records
   */
  async insertSpfModuleDefinitions(
    definitions: SpfModuleDefinition[],
  ): Promise<number[]> {
    if (definitions == null) {
      throw new Error('SPF module definitions cannot be null or undefined');
    }

    // TODO: Add custom mapping logic from SpfModuleDefinition DTO to domain object
    // This is not a straight mapping - implement business logic here
    const domainObjects = definitions.map(dto => {
      // Custom mapping logic goes here
      return dto; // Placeholder - replace with actual domain object
    });

    return this.bulkInsert(domainObjects, 'SPF module definitions');
  }

  /**
   * Bulk insert driver module definitions
   * @param definitions - Array of driver module definitions to insert
   * @returns Promise resolving to an array of system IDs of inserted records
   */
  async insertDriverModuleDefinitions(
    definitions: DriverModuleDefinition[],
  ): Promise<number[]> {
    if (definitions == null) {
      throw new Error('Driver module definitions cannot be null or undefined');
    }

    // TODO: Add custom mapping logic from DriverModuleDefinition DTO to domain object
    // This is not a straight mapping - implement business logic here
    const domainObjects = definitions.map(dto => {
      // Custom mapping logic goes here
      return dto; // Placeholder - replace with actual domain object
    });

    return this.bulkInsert(domainObjects, 'driver module definitions');
  }
}
