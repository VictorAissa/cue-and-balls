import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

/**
 * Custom Socket.IO adapter that routes events through Redis Pub/Sub.
 * Enables cross-pod WebSocket event delivery in a multi-replica deployment.
 * Must be instantiated and connected before the NestJS app starts listening.
 */
export class RedisIoAdapter extends IoAdapter {
    private adapterConstructor: ReturnType<typeof createAdapter> | undefined;

    /**
     * Establishes pub/sub Redis connections and initializes the Socket.IO adapter.
     * Uses two separate clients (pub + sub) as required by the Redis adapter protocol.
     */
    async connectToRedis(): Promise<void> {
        const pubClient = createClient({ url: process.env.REDIS_URL });
        const subClient = pubClient.duplicate();

        await Promise.all([pubClient.connect(), subClient.connect()]);

        this.adapterConstructor = createAdapter(pubClient, subClient);
    }

    /**
     * Overrides the default IoAdapter server creation to attach the Redis adapter.
     */
    createIOServer(port: number, options?: ServerOptions): any {
        const server = super.createIOServer(port, options);
        server.adapter(this.adapterConstructor);
        return server;
    }
}