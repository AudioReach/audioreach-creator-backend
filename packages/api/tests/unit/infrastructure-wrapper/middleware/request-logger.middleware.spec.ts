/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {AsyncLocalStorageLogContextProvider} from '@arc/logger';
import type {ActiveLogContext} from '@arc/logger';
import type {Logger, LogData} from '@arc/core';
import type {Request, Response} from 'express';
import {RequestLoggerMiddleware} from '../../../../src/infrastructure-wrapper/middleware/request-logger.middleware.js';
import {CLIENT_INSTANCE_ID_HEADER} from '../../../../src/decorators/client-instance-id.decorator.js';

const LAUNCH = '6aa7bf9e-2d6f-4df7-b87b-9812a493bc52';
const UI = 'audioreach-creator-ui';

/** An unsigned token: the middleware must not read it. */
const UNSIGNED_TOKEN = [
  Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),
  Buffer.from(JSON.stringify({clientId: 'c1', clientName: UI})).toString(
    'base64url',
  ),
  'signature',
].join('.');

interface Captured {
  msg: string;
  context: ActiveLogContext;
  data: LogData;
}

interface RequestShape {
  headers?: Record<string, string>;
  url?: string;
  body?: unknown;
}

describe('RequestLoggerMiddleware', () => {
  let logContext: AsyncLocalStorageLogContextProvider;
  let captured: Captured[];
  let middleware: RequestLoggerMiddleware;

  beforeEach(() => {
    logContext = new AsyncLocalStorageLogContextProvider();
    captured = [];
    // Record the context that is active when each log call is made, which is
    // what PinoLogService reads.
    const capture = (data: LogData) => {
      captured.push({msg: data.msg, context: logContext.current(), data});
    };
    const logger: Logger = {
      logVerbose: capture,
      logDebug: capture,
      logInfo: capture,
      logWarn: capture,
      logError: capture,
      logCritical: capture,
    };
    middleware = new RequestLoggerMiddleware(logger, logContext);
  });

  const makeRequest = ({headers = {}, url, body = {}}: RequestShape): Request =>
    ({
      method: 'GET',
      originalUrl: url ?? '/arc-api/v1/projects',
      headers,
      body,
    }) as unknown as Request;

  const makeResponse = (): Response =>
    ({
      statusCode: 200,
      send(this: Response, body: unknown) {
        return body;
      },
    }) as unknown as Response;

  /**
   * Runs the middleware, then sends the response from inside `next`, as a
   * controller would. Returns the context seen downstream.
   */
  const handle = (shape: RequestShape = {}): ActiveLogContext => {
    const res = makeResponse();
    let downstream: ActiveLogContext = {};
    middleware.use(makeRequest(shape), res, () => {
      downstream = logContext.current();
      res.send({ok: true});
    });
    return downstream;
  };

  it('opens the request context with only the launch ID', () => {
    const downstream = handle({
      url: '/arc-api/v1/projects/42/subgraphs?x=1',
      headers: {
        authorization: `Bearer ${UNSIGNED_TOKEN}`,
        [CLIENT_INSTANCE_ID_HEADER]: LAUNCH,
      },
    });

    // The client name and project are added later, once verified or routed.
    expect(downstream).toEqual({clientInstanceId: LAUNCH});
    expect(captured.map(c => c.msg)).toEqual(
      expect.arrayContaining([
        'incomingRequest',
        'requestHeaders',
        'outgoingResponse',
        'responseBody',
      ]),
    );
    expect(captured.every(c => c.context.clientInstanceId === LAUNCH)).toBe(
      true,
    );
  });

  it('writes the response logs with what downstream stages added', () => {
    const res = makeResponse();
    middleware.use(
      makeRequest({headers: {[CLIENT_INSTANCE_ID_HEADER]: LAUNCH}}),
      res,
      () => {
        logContext.enrich({projectId: '42', clientName: UI});
        res.send({ok: true});
      },
    );

    const context = (msg: string) => captured.find(c => c.msg === msg)?.context;
    expect(context('incomingRequest')).toEqual({clientInstanceId: LAUNCH});
    expect(context('outgoingResponse')).toEqual({
      clientInstanceId: LAUNCH,
      projectId: '42',
      clientName: UI,
    });
    expect(context('responseBody')).toEqual(context('outgoingResponse'));
  });

  describe('request body', () => {
    const SECRET = 'hunter2-s3cr3t';

    it.each([
      ['JSON', 'application/json'],
      ['multipart', 'multipart/form-data; boundary=x'],
    ])('is never logged (%s)', (_label, contentType) => {
      handle({
        headers: {'content-type': contentType, 'content-length': '42'},
        body: {password: SECRET, nested: {token: SECRET}},
      });

      expect(captured.map(c => c.msg)).not.toContain('requestBody');
      expect(JSON.stringify(captured.map(c => c.data))).not.toContain(SECRET);
    });

    it('is described by the content type and length in the headers record', () => {
      handle({
        headers: {'content-type': 'application/json', 'content-length': '42'},
        body: {password: SECRET},
      });

      const headers = captured.find(c => c.msg === 'requestHeaders')?.data;
      expect(headers?.description).toContain(
        '"content-type":"application/json"',
      );
      expect(headers?.description).toContain('"content-length":"42"');
    });
  });

  it('does not leak the context after the request', () => {
    handle({headers: {[CLIENT_INSTANCE_ID_HEADER]: LAUNCH}});
    expect(logContext.current()).toEqual({});
  });

  describe('client instance ID', () => {
    it('normalizes it to lower case', () => {
      expect(
        handle({headers: {[CLIENT_INSTANCE_ID_HEADER]: LAUNCH.toUpperCase()}})
          .clientInstanceId,
      ).toBe(LAUNCH);
    });

    it.each([
      ['not a UUID', 'not-a-uuid'],
      ['empty', ''],
      ['a UUID with extra text', `${LAUNCH}x`],
    ])('ignores an invalid header (%s) and still calls next', (_l, value) => {
      let called = false;
      const res = makeResponse();
      middleware.use(
        makeRequest({headers: {[CLIENT_INSTANCE_ID_HEADER]: value}}),
        res,
        () => {
          called = true;
          res.send({});
        },
      );

      expect(called).toBe(true);
      expect(captured.length).toBeGreaterThan(0);
      expect(
        captured.every(c => c.context.clientInstanceId === undefined),
      ).toBe(true);
    });

    it('is omitted when the header is missing', () => {
      expect(handle()).not.toHaveProperty('clientInstanceId');
    });
  });
});
