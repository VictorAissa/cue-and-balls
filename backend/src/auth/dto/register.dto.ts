import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
    @ApiProperty({ minLength: 3, maxLength: 32 })
    @IsString()
    @MinLength(3)
    @MaxLength(32)
    username!: string;

    @ApiProperty({ format: 'email' })
    @IsEmail()
    email!: string;

    @ApiProperty({ minLength: 8 })
    @IsString()
    @MinLength(8)
    password!: string;
}