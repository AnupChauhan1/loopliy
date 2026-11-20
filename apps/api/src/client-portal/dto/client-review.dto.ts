import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ClientReviewDto {
  @IsIn(['approve', 'reject', 'changes'])
  action: 'approve' | 'reject' | 'changes';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  feedback?: string;
}
