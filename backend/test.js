// scripts/test-full-game.js
const { io } = require('socket.io-client');

const BASE_URL = 'http://localhost:3000';

async function rest(method, path, body, token) {
    const res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token && { Authorization: `Bearer ${token}` }),
        },
        ...(body && { body: JSON.stringify(body) }),
    });
    const text = await res.text();
    return { status: res.status, data: text ? JSON.parse(text) : null };
}

function connect(token) {
    return new Promise((resolve) => {
        const socket = io(`${BASE_URL}/game`, {
            auth: { token: `Bearer ${token}` },
        });
        socket.on('connect', () => resolve(socket));
        socket.on('connect_error', (err) => console.error('connect_error', err.message));
    });
}

async function main() {
    // register + login Player A
    await rest('POST', '/auth/register', { username: 'playerA', email: 'a@test.com', password: 'password123' });
    const { data: loginA } = await rest('POST', '/auth/login', { email: 'a@test.com', password: 'password123' });
    const tokenA = loginA.accessToken;
    console.log('[A] logged in');

    // register + login Player B
    await rest('POST', '/auth/register', { username: 'playerB', email: 'b@test.com', password: 'password123' });
    const { data: loginB } = await rest('POST', '/auth/login', { email: 'b@test.com', password: 'password123' });
    const tokenB = loginB.accessToken;
    console.log('[B] logged in');

    // Player A crée la partie
    const { data: game } = await rest('POST', '/games', null, tokenA);
    console.log('[A] game created', game.id);

    // Player A se connecte en WS
    const socketA = await connect(tokenA);
    console.log('[A] connected to WS');
    socketA.on('room_joined', (d) => console.log('[A] room_joined status:', d.game.status));
    socketA.on('game_started', (d) => console.log('[A] game_started firstTurn:', d.firstTurnPlayerId));
    socketA.on('opponent_shot', (d) => console.log('[A] opponent_shot', d));
    socketA.on('shot_result', (d) => console.log('[A] shot_result nextTurn:', d.nextTurnPlayerId));
    socketA.on('game_over', (d) => console.log('[A] game_over', d));
    socketA.on('error', (d) => console.error('[A] error', d));

    // Player B rejoint
    await rest('POST', `/games/${game.id}/join`, null, tokenB);
    console.log('[B] joined game');

    // Player B se connecte en WS
    const socketB = await connect(tokenB);
    console.log('[B] connected to WS');
    socketB.on('room_joined', (d) => console.log('[B] room_joined status:', d.game.status));
    socketB.on('game_started', (d) => console.log('[B] game_started firstTurn:', d.firstTurnPlayerId));
    socketB.on('opponent_shot', (d) => console.log('[B] opponent_shot', d));
    socketB.on('shot_result', (d) => console.log('[B] shot_result nextTurn:', d.nextTurnPlayerId));
    socketB.on('game_over', (d) => console.log('[B] game_over', d));
    socketB.on('error', (d) => console.error('[B] error', d));

    // attendre game_started puis tirer
    await new Promise((r) => setTimeout(r, 500));

    console.log('[A] shooting...');
    socketA.emit('shoot', { angle: 1.5, power: 0.8, cueBallX: 0.25, cueBallY: 0.5 });

    await new Promise((r) => setTimeout(r, 500));

    console.log('[A] resolving shot (miss)...');
    socketA.emit('shot_resolved', {
        pocketedNumbers: [],
        finalPositions: [{ number: 0, x: 0.25, y: 0.5 }],
    });

    await new Promise((r) => setTimeout(r, 1000));
    process.exit(0);
}

main().catch(console.error);