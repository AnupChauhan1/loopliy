import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { MailService } from '../common/mail.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { getJwtSecret } from './jwt-secret';

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, MailService],
  exports: [AuthService],
})
export class AuthModule {}
