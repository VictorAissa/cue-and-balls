import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

type JwtPayload = {
    sub: string;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(private readonly config: ConfigService) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
        });
    }

    /**
     * Called after token signature is verified.
     * Return value is assigned to req.user.
     *
     * @param payload - decoded JWT payload
     * @returns object injected as req.user
     */
    validate(payload: JwtPayload): { playerId: string } {
        return { playerId: payload.sub };
    }
}