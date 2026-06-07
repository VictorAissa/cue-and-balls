import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePlayerDto } from './dto/update-player.dto';

const PLAYER_PUBLIC_SELECT = {
    id: true,
    userName: true,
    email: true,
    createdAt: true,
} as const;

@Injectable()
export class PlayersService {
    constructor(private readonly prisma: PrismaService) {}

    /**
     * Returns the authenticated player's public profile.
     *
     * @param playerId - ID extracted from JWT
     * @throws NotFoundException if the player does not exist
     */
    async findMe(playerId: string) {
        const player = await this.prisma.player.findUnique({
            where: { id: playerId },
            select: PLAYER_PUBLIC_SELECT,
        });

        if (!player) throw new NotFoundException('NOT_FOUND');

        return { ...player, username: player.userName };
    }

    /**
     * Updates the authenticated player's username.
     *
     * @param playerId - ID extracted from JWT
     * @param dto
     * @throws NotFoundException if the player does not exist
     * @throws ConflictException if the username is already taken
     */
    async updateMe(playerId: string, dto: UpdatePlayerDto) {
        try {
            const player = await this.prisma.player.update({
                where: { id: playerId },
                data: { userName: dto.username },
                select: PLAYER_PUBLIC_SELECT,
            });

            return { ...player, username: player.userName };
        } catch (err) {
            if (err instanceof Prisma.PrismaClientKnownRequestError) {
                if (err.code === 'P2025') throw new NotFoundException('NOT_FOUND');
                if (err.code === 'P2002') throw new ConflictException('USERNAME_TAKEN');
            }
            throw err;
        }
    }
}