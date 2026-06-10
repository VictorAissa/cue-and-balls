import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString } from 'class-validator';

export class LoginDto {
    @ApiProperty({ format: 'email' })
    @IsEmail()
    email!: string;

    @ApiProperty()
    @IsString()
    password!: string;
}