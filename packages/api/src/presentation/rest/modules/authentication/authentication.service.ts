import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RegisterDto } from './dto/authentication.dto.js';

@Injectable()
export class AuthenticationService {

    constructor(private jwtService: JwtService) { }

    //This api should be the first call from a client to get JWT for furture requests.
    register(request?: RegisterDto) {

        //TBD: call Core api to send clientName and get a unique id for client.
        //use dummy id '1' for now.
        const id = 1;
        const name = request?.clientName || id;//if clientId is not provided by a client, use id as name.

        // Create JWT payload with clientId (no name)
        const payload = {
            clientId: id
        };

        // Return the JWT token, clientId, clientName
        return {
            token: this.jwtService.sign(payload),
            clientId: id,
            clientName: name
        };
    }

}
