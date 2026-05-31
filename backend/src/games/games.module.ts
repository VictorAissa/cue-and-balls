import { Module } from '@nestjs/common';
import { GamesService } from './services/games.service';
import { ShotService } from './services/shot.service';
import { GameRulesService } from './services/game-rules.service';
import { GamesController } from './games.controller';

@Module({
  providers: [GamesService, ShotService, GameRulesService],
  controllers: [GamesController]
})
export class GamesModule {}
