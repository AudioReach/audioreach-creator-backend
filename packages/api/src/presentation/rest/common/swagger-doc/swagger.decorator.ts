import {applyDecorators, HttpStatus} from '@nestjs/common';
import type {Type} from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiBody,
  getSchemaPath,
} from '@nestjs/swagger';
import type {ApiBodyOptions, ApiResponseOptions} from '@nestjs/swagger';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';

interface ExampleConfig {
  modulePath?: string;
  className: string;
}

interface ApiDocumentationOptions {
  summary: string;
  description?: string;
  requestDto?: Type<unknown> | Type<unknown>[];
  requestDtoExample?: ExampleConfig;
  responseDto?: Type<unknown> | Type<unknown>[];
  responseDtoExample?: ExampleConfig;
  responseStatus?: HttpStatus;
  isRequestArray?: boolean;
  isResponseArray?: boolean;
}

interface ExampleClass {
  getExample?: () => unknown;
}

/**
 * Custom decorator that provides comprehensive API documentation with dynamic example loading
 * Supports both request and response DTOs, including arrays
 */
export function ApiDocumentationWithExample(options: ApiDocumentationOptions) {
  const decorators = [
    ApiOperation({
      summary: options.summary,
      description: options.description,
    }),
  ];

  // Handle request body documentation
  if (options.requestDto) {
    const requestBodyConfig = createRequestBodyConfig(options);
    decorators.push(ApiBody(requestBodyConfig as ApiBodyOptions));
  }

  // Handle response documentation
  const responseConfig = createResponseConfig(options);
  decorators.push(ApiResponse(responseConfig as ApiResponseOptions));

  return applyDecorators(...decorators);
}

/**
 * Helper function to check if a DTO is an array type
 */
function isArrayDto(
  dto: Type<unknown> | Type<unknown>[],
): dto is Type<unknown>[] {
  return Array.isArray(dto);
}

/**
 * Helper function to get the base type from array or single type
 */
function getBaseType(dto: Type<unknown> | Type<unknown>[]): Type<unknown> {
  return isArrayDto(dto) ? dto[0] : dto;
}

/**
 * Helper function to check if request/response should be treated as array
 */
function shouldTreatAsArray(
  dto: Type<unknown> | Type<unknown>[] | undefined,
  explicitFlag?: boolean,
): boolean {
  if (!dto) return false;
  return explicitFlag ?? isArrayDto(dto);
}

/**
 * Creates request body configuration
 */
function createRequestBodyConfig(options: ApiDocumentationOptions) {
  const isArray = shouldTreatAsArray(
    options.requestDto,
    options.isRequestArray,
  );
  const baseType = options.requestDto
    ? getBaseType(options.requestDto)
    : undefined;

  const config: Record<string, unknown> = {
    type: baseType,
  };

  if (options.requestDtoExample) {
    try {
      const example = loadExampleDynamicallySync(options.requestDtoExample);
      const exampleValue = isArray ? [example] : example;

      config.examples = {
        default: {
          value: exampleValue,
        },
      };

      if (isArray && baseType) {
        config.schema = {
          type: 'array',
          items: {$ref: getSchemaPath(baseType)},
        };
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.warn(`Failed to load request example: ${errorMessage}`);
    }
  }

  return config;
}

/**
 * Creates response configuration
 */
function createResponseConfig(options: ApiDocumentationOptions) {
  const responseStatus = options.responseStatus ?? HttpStatus.OK;
  const config: Record<string, unknown> = {
    status: responseStatus,
    description: getStatusDescription(responseStatus),
  };

  if (!options.responseDto) {
    return config;
  }

  addResponseTypeConfig(config, options);
  addResponseExampleConfig(config, options);

  return config;
}

/**
 * Adds response type configuration
 */
function addResponseTypeConfig(
  config: Record<string, unknown>,
  options: ApiDocumentationOptions,
) {
  const isArray = shouldTreatAsArray(
    options.responseDto,
    options.isResponseArray,
  );
  const baseType = options.responseDto
    ? getBaseType(options.responseDto)
    : undefined;

  if (isArray && baseType) {
    config.schema = {
      type: 'array',
      items: {$ref: getSchemaPath(baseType)},
    };
  } else {
    config.type = baseType;
  }
}

/**
 * Adds response example configuration
 */
function addResponseExampleConfig(
  config: Record<string, unknown>,
  options: ApiDocumentationOptions,
) {
  if (!options.responseDtoExample) {
    return;
  }

  try {
    const example = loadExampleDynamicallySync(options.responseDtoExample);
    const isArray = shouldTreatAsArray(
      options.responseDto,
      options.isResponseArray,
    );
    const exampleValue = isArray ? [example] : example;

    config.examples = {
      default: {
        value: exampleValue,
      },
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`Failed to load response example: ${errorMessage}`);
  }
}

/**
 * Loads an example class synchronously with proper error handling
 */
function loadExampleDynamicallySync(exampleConfig: ExampleConfig): unknown {
  try {
    const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
    let modulePath = path.resolve(currentDirectory, './dto-examples/index.js');

    // For compiled JavaScript, ensure we're looking for .js files
    if (!modulePath.endsWith('.js') && !modulePath.endsWith('.ts')) {
      // In production/compiled environment, look for .js files
      modulePath = existsSync(`${modulePath}.js`)
        ? `${modulePath}.js`
        : `${modulePath}.ts`;
    }

    const moduleContent = loadModule(modulePath);
    const ExampleClass = getExampleClass(
      moduleContent,
      exampleConfig.className,
    );

    if (!ExampleClass) {
      console.warn(
        `Class ${exampleConfig.className} not found in module ${exampleConfig.modulePath}`,
      );
      return getPlaceholderExample(exampleConfig.className);
    }

    return createExampleInstance(ExampleClass);
  } catch (error: unknown) {
    console.error(
      `Error loading example from ${exampleConfig.modulePath}:`,
      error,
    );
    return getPlaceholderExample(exampleConfig.className);
  }
}

/**
 * Loads a module using various strategies
 */
function loadModule(modulePath: string): Record<string, unknown> {
  try {
    const requireFromHere = createRequire(import.meta.url);
    // Clear cache to ensure fresh load
    delete requireFromHere.cache[requireFromHere.resolve(modulePath)];
    return requireFromHere(modulePath) as Record<string, unknown>;
  } catch {
    console.warn(
      `Could not load module ${modulePath}. Using placeholder example.`,
    );
    return {};
  }
}

/**
 * Extracts the example class from the loaded module
 */
function getExampleClass(
  moduleContent: Record<string, unknown>,
  className: string,
): ExampleClass | undefined {
  // Debug logging to see what's actually in the module
  console.log('Module content keys:', Object.keys(moduleContent));
  console.log('Looking for class:', className);
  console.log('Direct export check:', moduleContent[className]);
  console.log('Default export:', moduleContent.default);
  if (moduleContent.default && typeof moduleContent.default === 'object') {
    console.log(
      'Default export keys:',
      Object.keys(moduleContent.default as Record<string, unknown>),
    );
  }

  const directExport = moduleContent[className] as ExampleClass;
  if (directExport) {
    return directExport;
  }

  const defaultExport = moduleContent.default as Record<string, unknown>;
  if (defaultExport && typeof defaultExport === 'object') {
    return defaultExport[className] as ExampleClass;
  }

  return undefined;
}

/**
 * Creates an instance from the example class
 */
function createExampleInstance(ExampleClass: ExampleClass): unknown {
  // Check if it has a getExample method (instance method)
  if (typeof ExampleClass.getExample === 'function') {
    return ExampleClass.getExample();
  }

  // Check if it's a class with a static getExample method
  if (typeof ExampleClass === 'function') {
    const ClassConstructor = ExampleClass as unknown as {
      getExample?: () => unknown;
      new (): unknown;
    };
    if (typeof ClassConstructor.getExample === 'function') {
      return ClassConstructor.getExample();
    }
    // Try to instantiate it
    return new (ExampleClass as new () => unknown)();
  }

  // If it's an object, return it directly
  return ExampleClass;
}

/**
 * Creates a placeholder example when dynamic loading fails
 */
function getPlaceholderExample(className: string): Record<string, string> {
  return {
    _note: `Placeholder for ${className} - dynamic loading failed`,
    exampleData: 'Please check the module path and class name',
  };
}

/**
 * Gets a human-readable description for HTTP status codes
 */
function getStatusDescription(status: HttpStatus): string {
  const descriptions: Partial<Record<HttpStatus, string>> = {
    [HttpStatus.OK]: 'Success',
    [HttpStatus.CREATED]: 'Created',
    [HttpStatus.ACCEPTED]: 'Accepted',
    [HttpStatus.NO_CONTENT]: 'No Content',
    [HttpStatus.BAD_REQUEST]: 'Bad Request',
    [HttpStatus.UNAUTHORIZED]: 'Unauthorized',
    [HttpStatus.FORBIDDEN]: 'Forbidden',
    [HttpStatus.NOT_FOUND]: 'Not Found',
    [HttpStatus.CONFLICT]: 'Conflict',
    [HttpStatus.INTERNAL_SERVER_ERROR]: 'Internal Server Error',
  };

  return descriptions[status] ?? 'Response';
}

/**
 * Alternative decorator for simpler use cases without dynamic examples
 */
export function ApiDocumentation(options: {
  summary: string;
  description?: string;
  requestDto?: Type<unknown>;
  responseDto?: Type<unknown>;
  responseStatus?: HttpStatus;
  isRequestArray?: boolean;
  isResponseArray?: boolean;
}) {
  return ApiDocumentationWithExample(options);
}
