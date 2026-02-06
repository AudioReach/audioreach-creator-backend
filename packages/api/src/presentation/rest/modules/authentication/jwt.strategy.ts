import {Injectable, UnauthorizedException} from '@nestjs/common';
import {PassportStrategy} from '@nestjs/passport';
import {ExtractJwt, Strategy} from 'passport-jwt';
import {JWT_SECRET} from './dto/constants.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: JWT_SECRET,
      passReqToCallback: false, // No longer need request object
    });
  }

  validate(payload: {clientId: string}) {
    // Validate that the token contains required clientId
    if (!payload.clientId) {
      throw new UnauthorizedException('Invalid token: missing clientId');
    }

    // The returned value will be attached to the Request object
    return {
      clientId: payload.clientId,
    };
  }
}
