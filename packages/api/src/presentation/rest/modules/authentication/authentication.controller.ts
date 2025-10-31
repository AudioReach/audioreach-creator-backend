import { Controller, Post, Body, HttpStatus } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthenticationService } from './authentication.service.js';
import { RegisterDto, RegisterResponseData, } from './dto/authentication.dto.js';
import { ApiDocumentationWithExample } from '../../common/swagger-doc/swagger.decorator.js';
import { ApiResult } from "../../common/dtos/api-response.dto.js";


@ApiTags('authentication')
@Controller('arcapi/v1/auth')
export class AuthenticationController {
  constructor(private authService: AuthenticationService) { }

  @Post('register')
  @ApiDocumentationWithExample({
    summary: 'Register client',
    requestDto: RegisterDto,
    requestRequired: false,
    requestDtoExample: {
      className: 'RegisterDtoExample'
    },
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Client registered successfully',
        dto: RegisterResponseData,
        example: {
          className: 'RegisterResponseDataExample'
        }
      },
      {
        status: HttpStatus.BAD_REQUEST,
        description: 'Failed to register client',
      }
    ]
  })
  register(@Body() request?: RegisterDto): ApiResult<RegisterResponseData> {
    const data = this.authService.register(request);
    return {
      success: true,
      message: 'Registration successful',
      data: data
    };
  }
}
