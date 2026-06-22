import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { GameStatus } from '../../generated/prisma/client';

export class ListGamesDto {
    @ApiPropertyOptional({ enum: GameStatus, default: GameStatus.WAITING })
    @IsOptional()
    @IsEnum(GameStatus)
    status?: GameStatus = GameStatus.WAITING;
}
