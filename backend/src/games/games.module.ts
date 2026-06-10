import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { GamesController } from './games.controller';
import { GameGateway } from './games.gateway';
import { GameRulesService } from './services/game-rules.service';
import { GamesService } from './services/games.service';
import { ShotService } from './services/shot.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [GamesController],
  providers: [GamesService, ShotService, GameRulesService, GameGateway],
  exports: [GamesService],
})
export class GamesModule {}