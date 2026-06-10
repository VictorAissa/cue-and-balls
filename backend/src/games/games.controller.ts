import {
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    ParseUUIDPipe,
    Post,
    Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPlayer } from '../players/decorator/current-player.decorator';
import { ListGamesDto } from './dto/list-games.dto';
import {GamesService} from "./services/games.service";

@ApiTags('Games')
@ApiBearerAuth()
@Controller('games')
export class GamesController {
    constructor(private readonly gamesService: GamesService) {}

    @Get()
    listGames(@Query() dto: ListGamesDto) {
        return this.gamesService.listGames(dto);
    }

    @Post()
    createGame(@CurrentPlayer() playerId: string) {
        return this.gamesService.createGame(playerId);
    }

    @Get(':id')
    getGame(@Param('id', ParseUUIDPipe) gameId: string) {
        return this.gamesService.getGame(gameId);
    }

    @Post(':id/join')
    @HttpCode(HttpStatus.NO_CONTENT)
    joinGame(
        @Param('id', ParseUUIDPipe) gameId: string,
        @CurrentPlayer() playerId: string,
    ) {
        return this.gamesService.joinGame(gameId, playerId);
    }
}