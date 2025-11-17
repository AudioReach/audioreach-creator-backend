/**
 * Typed constants for handler keys in the parser registry.
 * Used to identify different handler functions.
 */
export const HANDLER_KEYS = {
  PARSE_CHUNK: 'parseChunk',
  PARSE_DEFINITION: 'parseDefinition', // For AWSP definition parsing
  BUILD_KEY_DEFINITIONS: 'buildKeyDefinitions', // For key definition building
  BUILD_SPF_MODULE_DEFINITIONS: 'buildSpfModuleDefinitions', // For SPF module definition building
  VALIDATE_CHUNK: 'validateChunk', // Future use
} as const;

/**
 * Typed constants for entity builder keys.
 * Used to identify different entity types in the entity builder registry.
 */
export const ENTITY_BUILDER_KEYS = {
  HEADER_ENTITY: 'HEADER_ENTITY',
  METADATA_ENTITY: 'METADATA_ENTITY',
  MODULE_ENTITY: 'MODULE_ENTITY',
  SUBGRAPH_ENTITY: 'SUBGRAPH_ENTITY',
  CONTAINER_ENTITY: 'CONTAINER_ENTITY',
} as const;

/**
 * Typed constants for handler keys in the entity builder registry.
 * Used to identify different handler functions.
 */
export const ENTITY_HANDLER_KEYS = {
  BUILD_ENTITY: 'buildEntity',
  VALIDATE_ENTITY: 'validateEntity', // Future use
  TRANSFORM_ENTITY: 'transformEntity', // Future use
} as const;

// Type exports for better type safety
export type HandlerKey = (typeof HANDLER_KEYS)[keyof typeof HANDLER_KEYS];
export type EntityBuilderKey =
  (typeof ENTITY_BUILDER_KEYS)[keyof typeof ENTITY_BUILDER_KEYS];
export type EntityHandlerKey =
  (typeof ENTITY_HANDLER_KEYS)[keyof typeof ENTITY_HANDLER_KEYS];
