/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BadRequestException, type ExecutionContext} from '@nestjs/common';
import {ROUTE_ARGS_METADATA} from '@nestjs/common/constants.js';
import type {Request} from 'express';
import {
  CLIENT_INSTANCE_ID_HEADER,
  ClientInstanceId,
  readClientInstanceId,
} from '../../../src/decorators/client-instance-id.decorator.js';

const LAUNCH = '6aa7bf9e-2d6f-4df7-b87b-9812a493bc52';

const requestWith = (value?: string | string[]): Request =>
  ({
    headers: value === undefined ? {} : {[CLIENT_INSTANCE_ID_HEADER]: value},
  }) as unknown as Request;

/** The function Nest calls to resolve `@ClientInstanceId()`. */
function factory(): (data: unknown, ctx: ExecutionContext) => string {
  class Target {
    handler(@ClientInstanceId() _launch: string): void {}
  }
  const metadata = Reflect.getMetadata(
    ROUTE_ARGS_METADATA,
    Target,
    'handler',
  ) as Record<string, {factory: (d: unknown, c: ExecutionContext) => string}>;
  return Object.values(metadata)[0].factory;
}

const resolve = (req: Request): string =>
  factory()(undefined, {
    switchToHttp: () => ({getRequest: () => req}),
  } as unknown as ExecutionContext);

const rejection = (req: Request): BadRequestException => {
  try {
    resolve(req);
  } catch (error) {
    return error as BadRequestException;
  }
  throw new Error('expected a BadRequestException');
};

describe('readClientInstanceId', () => {
  it.each([
    ['a UUID', LAUNCH, LAUNCH],
    ['an upper-case UUID, lower-cased', LAUNCH.toUpperCase(), LAUNCH],
    ['the first of repeated headers', [LAUNCH, 'x'], LAUNCH],
    ['a missing header', undefined, undefined],
    ['a non-UUID value', 'ui-1', undefined],
  ])('returns the launch for %s', (_label, value, expected) => {
    expect(readClientInstanceId(requestWith(value))).toBe(expected);
  });
});

describe('@ClientInstanceId()', () => {
  it('returns the header launch, lower-cased', () => {
    expect(resolve(requestWith(LAUNCH.toUpperCase()))).toBe(LAUNCH);
  });

  it('rejects a missing header with ERR_1002', () => {
    const error = rejection(requestWith());

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getResponse()).toEqual({
      message: 'X-ARC-Client-Instance-Id header is required',
      errorCode: 'ERR_1002',
    });
  });

  it('rejects a non-UUID value with ERR_1004', () => {
    const error = rejection(requestWith('ui-1'));

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getResponse()).toEqual({
      message: 'X-ARC-Client-Instance-Id must be a UUID',
      errorCode: 'ERR_1004',
    });
  });
});
