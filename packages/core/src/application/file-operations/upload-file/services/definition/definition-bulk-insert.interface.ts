import type {KeyDefinition} from '../../../shared/awsp-serializers/v1/definitions/key-definition/key-definition.js';
import type {TagDefinition} from '../../../shared/awsp-serializers/v1/definitions/tag-definition/tag-definition.js';
import type {SpfPropertyDefinition} from '../../../shared/awsp-serializers/v1/definitions/property-definition/spf-property-definition.js';
import type {DriverPropertyDefinition} from '../../../shared/awsp-serializers/v1/definitions/property-definition/driver-property-definition.js';
import type {SpfModuleDefinition} from '../../../shared/awsp-serializers/v1/definitions/module-definition/spf/spf-module-definition.js';
import type {DriverModuleDefinition} from '../../../shared/awsp-serializers/v1/definitions/module-definition/driver/driver-module-definition.js';

/**
 * Interface for bulk inserting definitions into the database
 */
export interface IDefinitionBulkInsert {
  /**
   * Bulk insert key definitions
   * @param definitions - Array of key definitions to insert
   * @returns Promise resolving to an array of system IDs of inserted records
   */
  insertKeyDefinitions(definitions: KeyDefinition[]): Promise<number[]>;

  /**
   * Bulk insert tag definitions
   * @param definitions - Array of tag definitions to insert
   * @returns Promise resolving to an array of system IDs of inserted records
   */
  insertTagDefinitions(definitions: TagDefinition[]): Promise<number[]>;

  /**
   * Bulk insert SPF property definitions
   * @param definitions - Array of SPF property definitions to insert
   * @returns Promise resolving to an array of system IDs of inserted records
   */
  insertSpfPropertyDefinitions(
    definitions: SpfPropertyDefinition[],
  ): Promise<number[]>;

  /**
   * Bulk insert driver property definitions
   * @param definitions - Array of driver property definitions to insert
   * @returns Promise resolving to an array of system IDs of inserted records
   */
  insertDriverPropertyDefinitions(
    definitions: DriverPropertyDefinition[],
  ): Promise<number[]>;

  /**
   * Bulk insert SPF module definitions
   * @param definitions - Array of SPF module definitions to insert
   * @returns Promise resolving to an array of system IDs of inserted records
   */
  insertSpfModuleDefinitions(
    definitions: SpfModuleDefinition[],
  ): Promise<number[]>;

  /**
   * Bulk insert driver module definitions
   * @param definitions - Array of driver module definitions to insert
   * @returns Promise resolving to an array of system IDs of inserted records
   */
  insertDriverModuleDefinitions(
    definitions: DriverModuleDefinition[],
  ): Promise<number[]>;
}
