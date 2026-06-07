import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPlayer } from './decorator/current-player.decorator';
import { UpdatePlayerDto } from './dto/update-player.dto';
import { PlayersService } from './players.service';

@ApiTags('Players')
@ApiBearerAuth()
@Controller('players')
export class PlayersController {
    constructor(private readonly playersService: PlayersService) {}

    @Get('me')
    findMe(@CurrentPlayer() playerId: string) {
        return this.playersService.findMe(playerId);
    }

    @Patch('me')
    updateMe(@CurrentPlayer() playerId: string, @Body() dto: UpdatePlayerDto) {
        return this.playersService.updateMe(playerId, dto);
    }
}