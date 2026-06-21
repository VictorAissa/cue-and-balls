import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
    HealthCheck,
    HealthCheckService,
    PrismaHealthIndicator,
} from '@nestjs/terminus';
import { Public } from '../auth/decorator/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Health')
@Controller()
export class HealthController {
    constructor(
        private readonly health: HealthCheckService,
        private readonly prismaIndicator: PrismaHealthIndicator,
        private readonly prisma: PrismaService,
    ) {}

    // Liveness: process is up, no external dependency checked.
    // A DB blip must never restart pods; that's readiness's job.
    @Public()
    @Get('health')
    @HealthCheck()
    liveness() {
        return this.health.check([]);
    }

    @Public()
    @Get('ready')
    @HealthCheck()
    readiness() {
        return this.health.check([
            () => this.prismaIndicator.pingCheck('postgres', this.prisma),
        ]);
    }
}