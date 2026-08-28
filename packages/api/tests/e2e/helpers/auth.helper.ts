/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Injectable} from '@nestjs/common';
import {PassportStrategy} from '@nestjs/passport';
import {Strategy, ExtractJwt} from 'passport-jwt';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const jwt = require('jsonwebtoken') as typeof import('jsonwebtoken');

const TEST_JWT_SECRET = 'arc-web-api';

/**
 * Mock JWT Strategy for E2E testing
 * Bypasses real authentication and accepts any valid JWT token
 */
@Injectable()
export class MockJwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: true, // Ignore expiration for testing
      secretOrKey: TEST_JWT_SECRET,
    });
  }

  async validate(payload: any) {
    return {
      clientId: payload.clientId || 'test-client',
    };
  }
}

/**
 * Generate a mock JWT token for testing
 * Produces a real HS256-signed token that passes passport-jwt verification
 */
export function generateMockJwtToken(): string {
  return jwt.sign({clientId: 'test-client'}, TEST_JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h',
  });
}

/**
 * Generate a mock JWT token with custom payload
 */
export function generateMockJwtTokenWithPayload(customPayload: any): string {
  return jwt.sign(customPayload, TEST_JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h',
  });
}
