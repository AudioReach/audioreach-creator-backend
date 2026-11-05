/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  createLogProducerIdentity,
  DEFAULT_SERVICE_NAME,
} from '../../../src/identity/log-producer-identity.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('createLogProducerIdentity', () => {
  it('defaults the service name', () => {
    expect(createLogProducerIdentity({}).serviceName).toBe(
      DEFAULT_SERVICE_NAME,
    );
    expect(DEFAULT_SERVICE_NAME).toBe('audioreach-creator-api');
  });

  it('uses OTEL_SERVICE_NAME when set', () => {
    expect(
      createLogProducerIdentity({OTEL_SERVICE_NAME: ' custom-api '})
        .serviceName,
    ).toBe('custom-api');
  });

  it('ignores a blank OTEL_SERVICE_NAME', () => {
    expect(
      createLogProducerIdentity({OTEL_SERVICE_NAME: '  '}).serviceName,
    ).toBe(DEFAULT_SERVICE_NAME);
  });

  it('creates a new UUID instance ID for each call', () => {
    const a = createLogProducerIdentity({});
    const b = createLogProducerIdentity({});
    expect(a.serviceInstanceId).toMatch(UUID_PATTERN);
    expect(a.serviceInstanceId).not.toBe(b.serviceInstanceId);
  });

  it('is immutable', () => {
    expect(Object.isFrozen(createLogProducerIdentity({}))).toBe(true);
  });
});
