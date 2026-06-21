import {Module} from '@nestjs/common';
import {AuthModule} from './auth/auth.module';
import {PlayersModule} from './players/players.module';
import {GamesModule} from './games/games.module';
import {PrismaModule} from "./prisma/prisma.module";
import {APP_GUARD} from "@nestjs/core";
import {ConfigModule} from "@nestjs/config";
import {JwtAuthGuard} from "./auth/guard/jwt-auth.guard";
import {HealthModule} from "./health/health.module";

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        AuthModule,
        PlayersModule,
        GamesModule,
        PrismaModule,
        HealthModule,
    ],
    providers: [
        { provide: APP_GUARD, useClass: JwtAuthGuard },
    ],
})
export class AppModule {
}
