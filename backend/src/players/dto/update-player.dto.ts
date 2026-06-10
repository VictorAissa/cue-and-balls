import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdatePlayerDto {
    @ApiProperty({ minLength: 3, maxLength: 32, required: false })
    @IsOptional()
    @IsString()
    @MinLength(3)
    @MaxLength(32)
    username?: string;
}