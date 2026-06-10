import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentPlayer = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext): string => {
        const request = ctx.switchToHttp().getRequest<{ user: { playerId: string } }>();
        return request.user.playerId;
    },
);