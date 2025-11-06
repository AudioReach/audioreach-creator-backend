import type {HandlerRegistryPort, Handler} from '@arc/core';
import {createParserRegistry, createEntityBuilderRegistry} from '@arc/core';

/**
 * Node.js implementation of handler registry.
 * This adapter is completely generic - it doesn't know about specific handler types.
 *
 * It simply combines handler registries from the core layer based on configuration.
 * The core layer defines what handlers exist; infrastructure just wires them together.
 *
 * Design principle: Infrastructure layer has ZERO business logic.
 * All handler implementations come from core layer registry factories.
 */
export class NodeRegistry implements HandlerRegistryPort {
  private handlers = new Map<string, Handler>();

  constructor() {
    this.registerHandlersFromCore();
  }

  /**
   * Register handlers from core layer registries.
   * Infrastructure layer doesn't define handlers - it just combines them.
   * All registries use built-in defaults from core layer.
   */
  private registerHandlersFromCore(): void {
    // Combine all handler registries from core layer
    const registries = [
      createParserRegistry(),
      createEntityBuilderRegistry(),
      // Future registries can be added here:
      // createValidationRegistry(),
      // createTransformationRegistry(),
    ];

    // Merge all registries into single handler map
    for (const registry of registries) {
      for (const [key, handler] of registry.entries()) {
        if (this.handlers.has(key)) {
          throw new Error(
            `Duplicate handler key: ${key}. Each handler must have a unique key.`,
          );
        }
        this.handlers.set(key, handler);
      }
    }
  }

  /**
   * Get a handler by its key
   */
  get(handlerKey: string): Handler {
    const handler = this.handlers.get(handlerKey);

    if (!handler) {
      throw new Error(`Unknown handler: ${handlerKey}`);
    }

    return handler;
  }

  /**
   * Check if a handler exists
   */
  has(handlerKey: string): boolean {
    return this.handlers.has(handlerKey);
  }
}
