/**
 * Specific input structure for entity building tasks
 */
export interface EntityBuilderInput {
  /** Type of entity to build (e.g., 'HEADER_ENTITY') */
  entityType: string;

  /** Extracted data required for entity creation */
  requiredData: any;
}
