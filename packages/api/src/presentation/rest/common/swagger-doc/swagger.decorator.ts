import { applyDecorators, HttpStatus } from '@nestjs/common';
import type { Type } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiBody, getSchemaPath, ApiExtraModels } from '@nestjs/swagger';
import type { ApiResponseOptions, ApiBodyOptions } from '@nestjs/swagger';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

interface ExampleConfig {
  modulePath?: string;
  className: string;
}

interface ResponseConfig {
  status: HttpStatus;
  description?: string;
  dto?: Type<unknown> | Type<unknown>[];
  example?: ExampleConfig;
  isArray?: boolean;
}

interface ApiDocumentationOptions {
  summary: string;
  description?: string;
  requestDto?: Type<unknown> | Type<unknown>[];
  requestDtoDescription?: string; // Custom description for request DTO
  requestDtoExample?: ExampleConfig;
  requestRequired?: boolean; // Whether the request body is required
  responseDto?: Type<unknown> | Type<unknown>[];
  responseDtoExample?: ExampleConfig;
  responseStatus?: HttpStatus; // Kept for backward compatibility
  responses?: ResponseConfig[]; // New array of response configurations
  isRequestArray?: boolean;
  isResponseArray?: boolean;
}

interface ExampleClass {
  getExample?: () => unknown;
}

/**
 * Custom decorator that provides comprehensive API documentation with dynamic example loading
 * Supports both request and response DTOs, including arrays and multiple response statuses
 */
export function ApiDocumentationWithExample(options: ApiDocumentationOptions) {
  const decorators = [
    ApiOperation({
      summary: options.summary,
      description: options.description,
    }),
  ];

  const dtoTypes: Type<unknown>[] = [];

  // Handle request documentation
  handleRequestDocumentation(options, decorators, dtoTypes);

  // Handle response documentation
  handleResponseDocumentation(options, decorators, dtoTypes);

  // Register all DTOs with Swagger
  if (dtoTypes.length > 0) {
    decorators.push(ApiExtraModels(...dtoTypes));
  }

  return applyDecorators(...decorators);
}

/**
 * Handles request body documentation
 */
function handleRequestDocumentation(
  options: ApiDocumentationOptions,
  decorators: ReturnType<typeof ApiOperation>[],
  dtoTypes: Type<unknown>[]
): void {
  if (!options.requestDto) {
    return;
  }

  const baseType = getBaseType(options.requestDto);
  const bodyConfig = createRequestBodyConfig(options, baseType);

  decorators.push(ApiBody(bodyConfig as ApiBodyOptions));

  if (baseType) {
    dtoTypes.push(baseType);
  }
}

/**
 * Creates request body configuration
 */
function createRequestBodyConfig(options: ApiDocumentationOptions, baseType: Type<unknown>): Record<string, unknown> {
  const defaultDescription = `${options.requestRequired === false ? 'Optional ' : ''}Request body parameter type: ${baseType?.name || 'unknown'}`;

  const bodyConfig: Record<string, unknown> = {
    required: options.requestRequired ?? true,
    description: options.requestDtoDescription || defaultDescription,
    schema: {
      $ref: getSchemaPath(baseType)
    }
  };

  if (options.requestDtoExample) {
    addRequestExample(bodyConfig, options.requestDtoExample, baseType);
  }

  return bodyConfig;
}

/**
 * Adds request example to body configuration
 */
function addRequestExample(bodyConfig: Record<string, unknown>, exampleConfig: ExampleConfig, baseType: Type<unknown>): void {
  try {
    const example = loadExampleDynamicallySync(exampleConfig);

    bodyConfig.examples = {
      default: {
        summary: `Example ${baseType?.name || 'request'}`,
        value: example,
      },
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`Failed to load request example: ${errorMessage}`);
  }
}

/**
 * Handles response documentation
 */
function handleResponseDocumentation(
  options: ApiDocumentationOptions,
  decorators: ReturnType<typeof ApiOperation>[],
  dtoTypes: Type<unknown>[]
): void {
  if (options.responses && options.responses.length > 0) {
    handleMultipleResponses(options.responses, decorators, dtoTypes);
  } else {
    handleSingleResponse(options, decorators, dtoTypes);
  }
}

/**
 * Handles multiple response configurations
 */
function handleMultipleResponses(
  responses: ResponseConfig[],
  decorators: ReturnType<typeof ApiOperation>[],
  dtoTypes: Type<unknown>[]
): void {
  for (const responseConfig of responses) {
    const config = createMultipleResponseConfig(responseConfig);
    decorators.push(ApiResponse(config as ApiResponseOptions));

    if (responseConfig.dto) {
      const baseType = getBaseType(responseConfig.dto);
      if (baseType) {
        dtoTypes.push(baseType);
      }
    }
  }
}

/**
 * Handles single response configuration (legacy)
 */
function handleSingleResponse(
  options: ApiDocumentationOptions,
  decorators: ReturnType<typeof ApiOperation>[],
  dtoTypes: Type<unknown>[]
): void {
  const responseConfig = createResponseConfig(options);
  decorators.push(ApiResponse(responseConfig as ApiResponseOptions));

  if (options.responseDto) {
    const baseType = getBaseType(options.responseDto);
    if (baseType) {
      dtoTypes.push(baseType);
    }
  }
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
 * Creates response configuration for multiple responses
 */
function createMultipleResponseConfig(responseConfig: ResponseConfig) {
  const config: Record<string, unknown> = {
    status: responseConfig.status,
    description: responseConfig.description ?? getStatusDescription(responseConfig.status),
  };

  if (!responseConfig.dto) {
    return config;
  }

  // Handle response type configuration
  const isArray = shouldTreatAsArray(responseConfig.dto, responseConfig.isArray);
  const baseType = getBaseType(responseConfig.dto);

  if (isArray && baseType) {
    config.schema = {
      type: 'array',
      items: { $ref: getSchemaPath(baseType) },
    };
  } else {
    config.type = baseType;
  }

  // Handle response example configuration
  if (responseConfig.example) {
    try {
      const example = loadExampleDynamicallySync(responseConfig.example);
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

  return config;
}

/**
 * Creates response configuration (legacy single response)
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
function addResponseTypeConfig(config: Record<string, unknown>, options: ApiDocumentationOptions) {
  const isArray = shouldTreatAsArray(options.responseDto, options.isResponseArray);
  const baseType = options.responseDto ? getBaseType(options.responseDto) : undefined;

  if (isArray && baseType) {
    config.schema = {
      type: 'array',
      items: { $ref: getSchemaPath(baseType) },
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
    const baseModulePath = path.resolve(currentDirectory, './dto-examples/index');

    // Determine the correct file extension
    const modulePath = getModulePath(baseModulePath);

    const moduleContent = loadModule(modulePath);
    const ExampleClass = getExampleClass(
      moduleContent,
      exampleConfig.className,
    );

    if (!ExampleClass) {
      console.warn(`Class ${exampleConfig.className} not found in module ${exampleConfig.modulePath || 'default'}`);
      return getPlaceholderExample(exampleConfig.className);
    }

    return createExampleInstance(ExampleClass);
  } catch (error: unknown) {
    console.error(`Error loading example from ${exampleConfig.modulePath || 'default'}:`, error);
    return getPlaceholderExample(exampleConfig.className);
  }
}

/**
 * Determines the correct module path with proper extension
 */
function getModulePath(baseModulePath: string): string {
  const jsPath = `${baseModulePath}.js`;
  const tsPath = `${baseModulePath}.ts`;

  // Use a whitelist approach for security
  const allowedPaths = [jsPath, tsPath];

  for (const allowedPath of allowedPaths) {
     
    if (existsSync(allowedPath)) {
      return allowedPath;
    }
  }

  // Default to .js if neither exists
  return jsPath;
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
function getExampleClass(moduleContent: Record<string, unknown>, className: string): ExampleClass | undefined {
  // Validate className to prevent object injection
  if (!isValidClassName(className)) {
    console.warn(`Invalid class name: ${className}`);
    return undefined;
  }

   
  const directExport = moduleContent[className] as ExampleClass;
  if (directExport) {
    return directExport;
  }

  const defaultExport = moduleContent.default;
  if (defaultExport && typeof defaultExport === 'object') {
    const defaultExportObject = defaultExport as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(defaultExportObject, className)) {
       
      return defaultExportObject[className] as ExampleClass;
    }
  }

  return undefined;
}

/**
 * Validates class name to prevent object injection attacks
 */
function isValidClassName(className: string): boolean {
  // Only allow alphanumeric characters and underscores
  const validClassNamePattern = /^[a-zA-Z_]\w*$/;
  return validClassNamePattern.test(className) &&
    className !== 'constructor' &&
    className !== '__proto__' &&
    className !== 'prototype';
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
      new(): unknown;
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
  requestDtoDescription?: string;
  responseDto?: Type<unknown>;
  responseStatus?: HttpStatus;
  isRequestArray?: boolean;
  isResponseArray?: boolean;
}) {
  return ApiDocumentationWithExample(options);
}

