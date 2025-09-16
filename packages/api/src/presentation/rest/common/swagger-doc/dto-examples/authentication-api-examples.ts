import { RegisterDto } from '../../../modules/authentication/dto/authentication.dto.js';

export const RegisterDtoExample = {
    getExample(): RegisterDto {
        return new RegisterDto('client-123');
    }
};
