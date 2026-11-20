import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateClientDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName: string;

  @IsString()
  @MinLength(12)
  @MaxLength(200)
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;
}

export class CreateClientPortalAccountDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName: string;

  @IsString()
  @MinLength(12)
  @MaxLength(200)
  password: string;
}
