import { RegisterDto, RegisterResponseData } from '../../../modules/authentication/dto/authentication.dto.js';

export const RegisterDtoExample = {
    getExample(): RegisterDto {
        const dto = new RegisterDto();
        dto.clientName = 'client-123';
        return dto;
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
