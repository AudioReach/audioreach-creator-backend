/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {AllExceptionsFilter} from '../../../../src/infrastructure-wrapper/filters/all-exceptions.filter.js';
import {
  ResourceNotFoundException,
  InvalidOperationException,
  ResourceConflictException,
  ValidationFailedException,
  DomainNotImplementedException,
} from '@arc/core';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let mockLogger: {
    logWarn: jest.Mock;
    logError: jest.Mock;
    logDebug: jest.Mock;
  };
  let mockResponse: {status: jest.Mock; json: jest.Mock};
  let mockRequest: {method: string; url: string};
  let mockHost: {
    switchToHttp: () => {
      getResponse: () => typeof mockResponse;
      getRequest: () => typeof mockRequest;
    };
  };

  beforeEach(() => {
    mockLogger = {logWarn: jest.fn(), logError: jest.fn(), logDebug: jest.fn()};
    mockResponse = {status: jest.fn().mockReturnThis(), json: jest.fn()};
    mockRequest = {method: 'GET', url: '/test'};
    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    };
    filter = new AllExceptionsFilter(mockLogger as any);
  });

  it('maps ResourceNotFoundException to 404', () => {
    const exception = new ResourceNotFoundException('Project not found');
    filter.catch(exception, mockHost as any);
    expect(mockResponse.status).toHaveBeenCalledWith(404);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        errorCode: 'RESOURCE_NOT_FOUND',
        message: 'Project not found',
      }),
    );
  });

  it('maps InvalidOperationException to 400', () => {
    const exception = new InvalidOperationException('Bad input', {field: 'x'});
    filter.catch(exception, mockHost as any);
    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        errorCode: 'INVALID_OPERATION',
        details: {field: 'x'},
      }),
    );
  });

  it('maps DomainNotImplementedException to 501', () => {
    const exception = new DomainNotImplementedException('getSubgraphs');
    filter.catch(exception, mockHost as any);
    expect(mockResponse.status).toHaveBeenCalledWith(501);
  });
});
