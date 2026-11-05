/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {randomUUID} from 'node:crypto';

export const DEFAULT_SERVICE_NAME = 'audioreach-creator-api';

/**
 * Identity of the process that writes log records (OpenTelemetry resource
 * attributes `service.name` and `service.instance.id`).
 */
export interface LogProducerIdentity {
  readonly serviceName: string;
  readonly serviceInstanceId: string;
}

/**
 * Builds the identity once per process. `OTEL_SERVICE_NAME` overrides the
 * service name; the instance ID is a new UUID on every start.
 */
export function createLogProducerIdentity(
  env: NodeJS.ProcessEnv = process.env,
): LogProducerIdentity {
  const serviceName = env.OTEL_SERVICE_NAME?.trim();
  return Object.freeze({
    serviceName:
      serviceName !== undefined && serviceName !== ''
        ? serviceName
        : DEFAULT_SERVICE_NAME,
    serviceInstanceId: randomUUID(),
  });
}
