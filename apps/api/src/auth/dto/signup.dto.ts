import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class SignupDto {
  @IsString()
  @MinLength(2)
  firstName: string;

  @IsString()
  @MinLength(1)
  lastName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsIn(['employee', 'client', 'hr', 'manager', 'admin'])
  accountType?: 'employee' | 'client' | 'hr' | 'manager' | 'admin';

  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  otpToken?: string;

  @IsOptional()
  @IsString()
  googleIdToken?: string;

  @IsOptional()
  @IsString()
  firebaseIdToken?: string;
}
