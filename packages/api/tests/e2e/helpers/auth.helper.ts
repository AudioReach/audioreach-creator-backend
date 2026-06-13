/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Injectable} from '@nestjs/common';
import {PassportStrategy} from '@nestjs/passport';
import {Strategy, ExtractJwt} from 'passport-jwt';
import {JwtService} from '@nestjs/jwt';

const TEST_SECRET = 'test-secret-key';

/**
 * Mock JWT Strategy for E2E testing.
 * Accepts any token signed with TEST_SECRET — ignores expiration.
 */
@Injectable()
export class MockJwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: true,
      secretOrKey: TEST_SECRET,
    });
  }

  async validate(payload: any) {
    return {
      userId: payload.sub || 'test-user-id',
      username: payload.username || 'test-user',
      email: payload.email || 'test@example.com',
    };
  }
}

/**
 * Generate a JWT token properly signed with the test secret.
 */
export function generateMockJwtToken(): string {
  const jwtService = new JwtService({secret: TEST_SECRET});
  return jwtService.sign(
    {
      sub: 'test-user-id',
      username: 'test-user',
      email: 'test@example.com',
    },
    {expiresIn: '1h'},
  );
}

/**
 * Generate a JWT token with custom payload, signed with the test secret.
 */
export function generateMockJwtTokenWithPayload(customPayload: any): string {
  const jwtService = new JwtService({secret: TEST_SECRET});
  return jwtService.sign(
    {
      sub: customPayload.userId || 'test-user-id',
      username: customPayload.username || 'test-user',
      email: customPayload.email || 'test@example.com',
      ...customPayload,
    },
    {expiresIn: '1h'},
  );
}
