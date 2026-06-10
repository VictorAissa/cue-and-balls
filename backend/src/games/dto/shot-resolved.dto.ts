import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNumber, Max, Min, ValidateNested } from 'class-validator';

class BallPositionDto {
    @IsInt()
    @Min(0)
    @Max(15)
    number!: number;

    @IsNumber()
    @Min(0)
    @Max(1)
    x!: number;

    @IsNumber()
    @Min(0)
    @Max(1)
    y!: number;
}

export class ShotResolvedDto {
    @IsArray()
    @IsInt({ each: true })
    @Min(0, { each: true })
    @Max(15, { each: true })
    pocketedNumbers!: number[];

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => BallPositionDto)
    finalPositions!: BallPositionDto[];
}