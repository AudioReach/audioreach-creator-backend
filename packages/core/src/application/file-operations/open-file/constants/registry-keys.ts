/**
 * Typed constants for chunk parser keys.
 * Used to identify different chunk types in the parser registry.
 */
export const CHUNK_PARSER_KEYS = {
  HEADER: 'HEADER',
  METADATA: 'METADATA',
  MODULE: 'MODULE',
  SUBGRAPH: 'SUBGRAPH',
  CONTAINER: 'CONTAINER',
} as const;

/**
 * Typed constants for handler keys in the parser registry.
 * Used to identify different handler functions.
 */
export const HANDLER_KEYS = {
  PARSE_CHUNK: 'parseChunk',
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
export type ChunkParserKey =
  (typeof CHUNK_PARSER_KEYS)[keyof typeof CHUNK_PARSER_KEYS];
export type HandlerKey = (typeof HANDLER_KEYS)[keyof typeof HANDLER_KEYS];
export type EntityBuilderKey =
  (typeof ENTITY_BUILDER_KEYS)[keyof typeof ENTITY_BUILDER_KEYS];
export type EntityHandlerKey =
  (typeof ENTITY_HANDLER_KEYS)[keyof typeof ENTITY_HANDLER_KEYS];
