import {Module} from '@nestjs/common';
import {AuthModule} from './auth/auth.module';
import {PlayersModule} from './players/players.module';
import {GamesModule} from './games/games.module';
import {PrismaModule} from "./prisma/prisma.module";

@Module({
    imports: [
        AuthModule,
        PlayersModule,
        GamesModule,
        PrismaModule,

    ],
})
export class AppModule {
}
