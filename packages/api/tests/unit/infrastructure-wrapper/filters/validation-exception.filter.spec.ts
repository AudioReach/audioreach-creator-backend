/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {BadRequestException} from '@nestjs/common';
import {ValidationExceptionFilter} from '../../../../src/infrastructure-wrapper/filters/validation-exception.filter.js';

describe('ValidationExceptionFilter', () => {
  let filter: ValidationExceptionFilter;
  let mockLogger: {
    logWarn: jest.Mock;
    logError: jest.Mock;
    logDebug: jest.Mock;
  };
  let mockResponse: {status: jest.Mock; json: jest.Mock};
  let mockHost: unknown;
  const SECRET = 'hunter2-s3cr3t';

  beforeEach(() => {
    mockLogger = {logWarn: jest.fn(), logError: jest.fn(), logDebug: jest.fn()};
    mockResponse = {status: jest.fn().mockReturnThis(), json: jest.fn()};
    const mockRequest = {
      url: '/arc-api/v1/logs',
      headers: {authorization: 'Bearer secret'},
      body: {password: SECRET, unexpected: 1},
      query: {token: SECRET},
      params: {projectId: SECRET},
    };
    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    };
    filter = new ValidationExceptionFilter(mockLogger as any);
  });

  const body = () =>
    mockResponse.json.mock.calls[0][0] as Record<string, unknown>;

  it('returns the failed constraints in message and details (FR-EH-06)', () => {
    // The shape ValidationPipe produces.
    const exception = new BadRequestException({
      statusCode: 400,
      error: 'Bad Request',
      message: [
        'property msg should not exist',
        'eventName must be shorter than or equal to 256 characters',
      ],
    });

    filter.catch(exception, mockHost as any);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(body()).toMatchObject({
      statusCode: 400,
      errorCode: 'BadRequestException',
      message:
        'property msg should not exist; eventName must be shorter than or equal to 256 characters',
      details: [
        'property msg should not exist',
        'eventName must be shorter than or equal to 256 characters',
      ],
      path: '/arc-api/v1/logs',
    });
    expect(typeof body().timestamp).toBe('string');
  });

  it('returns a plain BadRequestException message without details', () => {
    filter.catch(
      new BadRequestException('serviceName "x" is reserved for the API'),
      mockHost as any,
    );

    expect(body()).toMatchObject({
      statusCode: 400,
      errorCode: 'BadRequestException',
      message: 'serviceName "x" is reserved for the API',
    });
    expect('details' in body()).toBe(false);
  });

  it('keeps an errorCode and details supplied by the thrower', () => {
    filter.catch(
      new BadRequestException({
        message: 'bad',
        errorCode: 'INVALID_FILE',
        details: {field: 'file'},
      }),
      mockHost as any,
    );

    expect(body()).toMatchObject({
      errorCode: 'INVALID_FILE',
      message: 'bad',
      details: {field: 'file'},
    });
  });

  it('logs a validation failure as a warning, not an error (FR-EH-11)', () => {
    filter.catch(new BadRequestException(['x is bad']), mockHost as any);

    expect(mockLogger.logWarn).toHaveBeenCalled();
    expect(mockLogger.logError).not.toHaveBeenCalled();
  });

  it('logs the failed rules, never the body, query, or parameters', () => {
    filter.catch(
      new BadRequestException({
        statusCode: 400,
        message: ['property unexpected should not exist'],
      }),
      mockHost as any,
    );

    expect(mockLogger.logWarn).toHaveBeenCalledTimes(1);
    expect(mockLogger.logDebug).not.toHaveBeenCalled();
    const [record] = mockLogger.logWarn.mock.calls[0] as [
      Record<string, unknown>,
    ];
    expect(record).toMatchObject({eventName: 'validationFailed'});
    const {message} = record.error as Error;
    expect(message).toContain('property unexpected should not exist');

    // JSON.stringify drops an Error's message, so check it separately.
    const logged =
      JSON.stringify(Object.values(mockLogger).flatMap(m => m.mock.calls)) +
      message;
    expect(logged).not.toContain(SECRET);
    expect(logged).not.toContain('Bearer secret');
  });
});
