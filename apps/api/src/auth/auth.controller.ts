import { Controller, Post, Body, HttpCode, HttpStatus, Get, UseGuards, Request, UploadedFile, UseInterceptors, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SignupDto } from './dto/signup.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { IsEmail, IsString, MinLength } from 'class-validator';

class VerifyEmailDto {
  @IsEmail()
  email: string;

  @IsString()
  token: string;
}

class ForgotPasswordDto {
  @IsEmail()
  email: string;
}

class ResetPasswordDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(8)
  newPassword: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('signup')
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const dir = join(process.cwd(), 'uploads', 'avatars');
          mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (req, file, cb) => {
          const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60);
          cb(null, `${Date.now()}-${randomUUID().slice(0, 8)}-${safe}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (req, file, cb) =>
        cb(/^image\//.test(file.mimetype) ? null : new BadRequestException('Only image files are allowed'), /^image\//.test(file.mimetype)),
    }),
  )
  async signup(@Body() dto: SignupDto, @UploadedFile() photo?: any) {
    return this.authService.signup(dto, photo ? `/uploads/avatars/${photo.filename}` : undefined);
  }

  @Post('verify-email')
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.email, dto.token);
  }

  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  sendOtp(@Body() body: { email: string }) {
    return this.authService.sendOtp(body.email);
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  verifyOtp(@Body() body: { email: string; code: string }) {
    return this.authService.verifyOtp(body.email, body.code);
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  resendVerification(@Body() body: { email: string }) {
    return this.authService.resendVerification(body.email);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Get('validate')
  @UseGuards(JwtAuthGuard)
  async validate(@Request() req: any) {
    return { valid: true, user: req.user };
  }
}
