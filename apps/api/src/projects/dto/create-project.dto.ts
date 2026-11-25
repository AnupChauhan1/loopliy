import { Type } from 'class-transformer';
import { IsString, IsOptional, IsEnum, IsDate, IsNumber, IsArray, ValidateNested, IsInt, Min } from 'class-validator';

export enum ProjectStatus {
  PLANNING = 'planning',
  ACTIVE = 'active',
  ON_HOLD = 'on_hold',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum ProjectPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

export class TemplateTaskDto {
  @IsString()
  title: string;

  @IsInt()
  @Min(1)
  dayOffset: number;
}

export class CreateProjectDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  section?: string;

  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

  @IsOptional()
  @IsEnum(ProjectPriority)
  priority?: ProjectPriority;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  deadline?: Date;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsNumber()
  budget?: number;

  @IsOptional()
  @IsEnum(['recurring', 'one_time'])
  projectType?: string;

  @IsOptional()
  @IsEnum(['days', 'weeks', 'months'])
  tenureUnit?: string;

  @IsOptional()
  @IsNumber()
  tenureValue?: number;

  @IsOptional()
  @IsEnum(['fixed', 'customised'])
  planStructure?: string;

  @IsOptional()
  @IsString()
  service?: string;

  /** Auto-dated task specs ({ title, dayOffset }) — due dates are computed from the cycle start date. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateTaskDto)
  taskTemplate?: TemplateTaskDto[];
}
