/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {UnauthorizedException} from '@nestjs/common';
import {AsyncLocalStorageLogContextProvider} from '@arc/logger';
import {JwtStrategy} from '../../../../../../src/presentation/rest/modules/authentication/jwt.strategy.js';

const LAUNCH = '6aa7bf9e-2d6f-4df7-b87b-9812a493bc52';

describe('JwtStrategy.validate', () => {
  let logContext: AsyncLocalStorageLogContextProvider;
  let strategy: JwtStrategy;

  beforeEach(() => {
    logContext = new AsyncLocalStorageLogContextProvider();
    strategy = new JwtStrategy(logContext);
  });

  it('returns the client from a complete payload, dropping other claims', () => {
    expect(
      strategy.validate({
        clientId: 'c1',
        clientName: 'audioreach-creator-ui',
        iat: 1,
        exp: 2,
      }),
    ).toEqual({clientId: 'c1', clientName: 'audioreach-creator-ui'});
  });

  it('adds the client name to the request log context', () => {
    logContext.run({clientInstanceId: LAUNCH}, () => {
      strategy.validate({clientId: 'c1', clientName: 'audioreach-creator-ui'});
      expect(logContext.current()).toEqual({
        clientInstanceId: LAUNCH,
        clientName: 'audioreach-creator-ui',
      });
    });
  });

  it.each([
    ['a token issued before clientName was required', {clientId: 'c1'}],
    ['an empty clientName', {clientId: 'c1', clientName: ''}],
    ['a non-string clientName', {clientId: 'c1', clientName: 5}],
    ['a missing clientId', {clientName: 'audioreach-creator-ui'}],
    ['a payload that is not an object', 'c1'],
    ['a null payload', null],
  ])('rejects %s with 401', (_label, payload) => {
    expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
  });

  it('leaves the log context unchanged when it rejects', () => {
    logContext.run({clientInstanceId: LAUNCH}, () => {
      expect(() =>
        strategy.validate({clientName: 'audioreach-creator-ui'}),
      ).toThrow(UnauthorizedException);
      expect(logContext.current()).toEqual({clientInstanceId: LAUNCH});
    });
  });
});
