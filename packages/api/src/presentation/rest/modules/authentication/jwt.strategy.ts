/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Inject, Injectable, UnauthorizedException} from '@nestjs/common';
import {PassportStrategy} from '@nestjs/passport';
import {ExtractJwt, Strategy} from 'passport-jwt';
import {JWT_SECRET} from './dto/constants.js';
import {isAccessTokenPayload} from './access-token-payload.js';
import type {ActiveLogContextProvider} from '@arc/logger';
import {LOG_CONTEXT} from '../../../../infrastructure-wrapper/logging.module.js';
import type {AuthenticatedClient} from '../../../../types/authenticated-request.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    @Inject(LOG_CONTEXT) private readonly logContext: ActiveLogContextProvider,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: JWT_SECRET,
      passReqToCallback: false, // No longer need request object
    });
  }

  /**
   * Called with a verified payload; the result becomes `request.user`.
   * Also adds the client name to the request's log context, so that every
   * later record of the request carries it. A token that fails verification
   * never gets here, so a forged name never reaches the logs.
   */
  validate(payload: unknown): AuthenticatedClient {
    // Tokens issued before clientName was required lack it; such clients
    // must register again.
    if (!isAccessTokenPayload(payload)) {
      throw new UnauthorizedException(
        'Invalid token: missing clientId or clientName; register again',
      );
    }
    this.logContext.enrich({clientName: payload.clientName});
    return {clientId: payload.clientId, clientName: payload.clientName};
  }
}
