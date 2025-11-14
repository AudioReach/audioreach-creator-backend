import {validate} from 'class-validator';
import {DEFINITION_BLOCK_NAMES} from '../../../shared/constants/definition-block-names.js';

/**
 * Service for validating definition objects using class-validator
 * Provides parallel validation with detailed error reporting
 */
export class DefinitionValidatorService {
  /**
   * Validate all definition categories in parallel
   * @param definitions - Object containing all parsed definitions
   * @throws Error if validation fails for any definition
   */
  async validateAllDefinitions(
    definitions: Record<string, unknown>,
  ): Promise<void> {
    // Run all category validations in parallel
    const [
      keyDefErrors,
      tagDefErrors,
      spfPropDefErrors,
      driverPropDefErrors,
      spfModDefErrors,
      driverModDefErrors,
    ] = await Promise.all([
      this.validateKeyDefinitions(definitions.keyDefinitions),
      this.validateTagDefinitions(definitions.tagDefinitions),
      this.validateSpfPropertyDefinitions(definitions.spfPropertyDefinitions),
      this.validateDriverPropertyDefinitions(
        definitions.driverPropertyDefinitions,
      ),
      this.validateSpfModuleDefinitions(definitions.spfModuleDefinitions),
      this.validateDriverModuleDefinitions(definitions.driverModuleDefinitions),
    ]);

    // Collect all errors
    const allErrors = [
      ...keyDefErrors,
      ...tagDefErrors,
      ...spfPropDefErrors,
      ...driverPropDefErrors,
      ...spfModDefErrors,
      ...driverModDefErrors,
    ];

    if (allErrors.length > 0) {
      throw new Error(
        `Validation failed for definitions:\n\n${JSON.stringify(allErrors, null, 2)}`,
      );
    }
  }

  /**
   * Validate key definitions
   */
  async validateKeyDefinitions(definitions: unknown): Promise<any[]> {
    return this.validateCategory(
      DEFINITION_BLOCK_NAMES.KEY_DEFINITIONS,
      definitions,
    );
  }

  /**
   * Validate tag definitions
   */
  async validateTagDefinitions(definitions: unknown): Promise<any[]> {
    return this.validateCategory(
      DEFINITION_BLOCK_NAMES.TAG_DEFINITIONS,
      definitions,
    );
  }

  /**
   * Validate SPF property definitions
   */
  async validateSpfPropertyDefinitions(definitions: unknown): Promise<any[]> {
    return this.validateCategory(
      DEFINITION_BLOCK_NAMES.SPF_PROPERTY_DEFINITIONS,
      definitions,
    );
  }

  /**
   * Validate driver property definitions
   */
  async validateDriverPropertyDefinitions(
    definitions: unknown,
  ): Promise<any[]> {
    return this.validateCategory(
      DEFINITION_BLOCK_NAMES.DRIVER_PROPERTY_DEFINITIONS,
      definitions,
    );
  }

  /**
   * Validate SPF module definitions
   */
  async validateSpfModuleDefinitions(definitions: unknown): Promise<any[]> {
    return this.validateCategory(
      DEFINITION_BLOCK_NAMES.SPF_MODULE_DEFINITIONS,
      definitions,
    );
  }

  /**
   * Validate driver module definitions
   */
  async validateDriverModuleDefinitions(definitions: unknown): Promise<any[]> {
    return this.validateCategory(
      DEFINITION_BLOCK_NAMES.DRIVER_MODULE_DEFINITIONS,
      definitions,
    );
  }

  /**
   * Generic validation method for a category
   * @param categoryName - Name of the category being validated
   * @param definitions - Array of definitions to validate
   * @returns Array of validation errors
   */
  private async validateCategory(
    categoryName: string,
    definitions: unknown,
  ): Promise<any[]> {
    if (!definitions || !Array.isArray(definitions)) {
      return [];
    }

    // Validate all items in parallel
    const validationPromises = definitions.map(async (item, index) => {
      const errors = await validate(item);
      if (errors.length === 0) {
        return null;
      }

      return {
        category: categoryName,
        index,
        errors: errors.map(error =>
          this.formatValidationError(error, `${categoryName}[${index}]`),
        ),
      };
    });

    const results = await Promise.all(validationPromises);
    return results.filter(result => result !== null);
  }

  /**
   * Format validation error with field hierarchy
   * @param error - Validation error from class-validator
   * @param path - Current path in the object hierarchy
   * @returns Formatted error string with hierarchy
   */
  private formatValidationError(error: any, path: string): string {
    const currentPath = `${path}.${error.property}`;
    const messages: string[] = [];

    // Add constraint messages for current field
    if (error.constraints) {
      Object.values(error.constraints).forEach((constraint: any) => {
        messages.push(`  ↳ ${currentPath}: ${constraint}`);
      });
    }

    // Recursively format nested errors (for nested objects/arrays)
    if (error.children && error.children.length > 0) {
      error.children.forEach((childError: any) => {
        messages.push(this.formatValidationError(childError, currentPath));
      });
    }

    return messages.join('\n');
  }
}
