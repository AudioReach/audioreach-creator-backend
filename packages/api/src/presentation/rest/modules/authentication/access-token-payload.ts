/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/** Claims the API signs into every access token it issues at registration. */
export interface AccessTokenPayload {
  /** Generated at registration; identifies this registration */
  readonly clientId: string;
  /** The name the client registered with, e.g. `audioreach-creator-ui` */
  readonly clientName: string;
}

/** Narrows a decoded, not necessarily verified, token payload. */
export function isAccessTokenPayload(
  value: unknown,
): value is AccessTokenPayload {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const {clientId, clientName} = value as Record<string, unknown>;
  return (
    typeof clientId === 'string' &&
    clientId !== '' &&
    typeof clientName === 'string' &&
    clientName !== ''
  );
}
