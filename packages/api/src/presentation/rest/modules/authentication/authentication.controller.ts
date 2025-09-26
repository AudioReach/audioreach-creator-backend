import { Controller, Post, Body, HttpStatus } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthenticationService } from './authentication.service.js';
import { RegisterDto } from './dto/authentication.dto.js';
import { ApiDocumentationWithExample } from '../../common/swagger-doc/swagger.decorator.js';


@ApiTags('authentication')
@Controller('arcapi/v1/auth')
export class AuthenticationController {
  constructor(private authService: AuthenticationService) { }

  @Post('register')
  @ApiDocumentationWithExample({
    summary: 'Register client',
    requestDto: RegisterDto,
    requestDtoExample: {
      className: 'RegisterDtoExample'
    },
    responseStatus: HttpStatus.OK,
  })
  register(@Body() request?: RegisterDto) {
    return this.authService.register(request);
  }
}
