import { RegisterDto, RegisterResponseData } from '../../../modules/authentication/dto/authentication.dto.js';

export const RegisterDtoExample = {
    getExample(): RegisterDto {
        return new RegisterDto('client-123');
    }
};

export const RegisterResponseDataExample = {
    getExample(): RegisterResponseData {
        return {
            token: 'jwt.token.here',
            clientId: 1,
            clientName: 'client-123'
        };
    }
};
