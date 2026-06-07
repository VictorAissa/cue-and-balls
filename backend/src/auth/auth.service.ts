import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { Prisma } from '../generated/prisma/client';

const BCRYPT_ROUNDS = 10;

type PlayerPublic = {
    id: string;
    username: string;
    email: string;
    createdAt: Date;
};

@Injectable()
export class AuthService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly jwtService: JwtService,
    ) {}

    /**
     * Creates a new player account.
     * Throws 409 if username or email is already taken.
     *
     * @returns the created player (public fields only, no password hash)
     */
    async register(dto: RegisterDto): Promise<PlayerPublic> {
        const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

        try {
            const player = await this.prisma.player.create({
                data: {
                    userName: dto.username,
                    email: dto.email,
                    passwordHash,
                },
                select: {
                    id: true,
                    userName: true,
                    email: true,
                    createdAt: true,
                },
            });

            return {
                id: player.id,
                username: player.userName,
                email: player.email,
                createdAt: player.createdAt,
            };
        } catch (err) {
            if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
                const fields = err.meta?.target as string[] | undefined;
                const code = fields?.includes('email') ? 'EMAIL_TAKEN' : 'USERNAME_TAKEN';
                throw new ConflictException(code);
            }
            throw err;
        }
    }

    /**
     * Validates credentials and returns a signed JWT access token.
     * Throws 401 on invalid email or wrong password.
     *
     * @returns object containing the signed access token
     */
    async login(dto: LoginDto): Promise<{ accessToken: string }> {
        const player = await this.prisma.player.findUnique({
            where: { email: dto.email },
            select: { id: true, passwordHash: true },
        });

        if (!player) throw new UnauthorizedException('UNAUTHORIZED');

        const isPasswordValid = await bcrypt.compare(dto.password, player.passwordHash);
        if (!isPasswordValid) throw new UnauthorizedException('UNAUTHORIZED');

        const accessToken = await this.jwtService.signAsync({ sub: player.id });

        return { accessToken };
    }
}