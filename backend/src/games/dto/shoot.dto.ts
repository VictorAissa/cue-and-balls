import { IsNumber, Max, Min } from 'class-validator';

export class ShootDto {
    @IsNumber()
    angle!: number;

    @IsNumber()
    @Min(0)
    @Max(1)
    power!: number;

    @IsNumber()
    @Min(0)
    @Max(1)
    cueBallX!: number;

    @IsNumber()
    @Min(0)
    @Max(1)
    cueBallY!: number;
}