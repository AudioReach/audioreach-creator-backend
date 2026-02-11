/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Injectable} from '@nestjs/common';
import {PassportStrategy} from '@nestjs/passport';
import {Strategy, ExtractJwt} from 'passport-jwt';

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
      secretOrKey: 'test-secret-key', // Test secret
    });
  }

  /**
   * Validate method that always succeeds for testing
   * Returns a mock user object
   */
  async validate(payload: any) {
    return {
      userId: payload.sub || 'test-user-id',
      username: payload.username || 'test-user',
      email: payload.email || 'test@example.com',
    };
  }
}

/**
 * Generate a mock JWT token for testing
 * This creates a simple base64-encoded token that will pass the MockJwtStrategy
 */
export function generateMockJwtToken(): string {
  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  const payload = {
    sub: 'test-user-id',
    username: 'test-user',
    email: 'test@example.com',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
  };

  // Create a simple JWT-like token (not cryptographically signed, just for testing)
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString(
    'base64url',
  );
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    'base64url',
  );
  const signature = 'mock-signature';

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Generate a mock JWT token with custom payload
 */
export function generateMockJwtTokenWithPayload(customPayload: any): string {
  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  const payload = {
    sub: customPayload.userId || 'test-user-id',
    username: customPayload.username || 'test-user',
    email: customPayload.email || 'test@example.com',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...customPayload,
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString(
    'base64url',
  );
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    'base64url',
  );
  const signature = 'mock-signature';

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}
