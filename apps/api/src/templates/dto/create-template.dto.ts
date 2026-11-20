import { IsString, IsOptional, IsEnum, IsBoolean } from 'class-validator';

export class CreateTemplateDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsEnum(['low', 'medium', 'high', 'critical'])
  defaultPriority?: string;

  @IsOptional()
  @IsEnum(['open', 'in_progress', 'ignore', 'closed'])
  defaultStatus?: string;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  departmentId?: string;
}
