import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

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
}
