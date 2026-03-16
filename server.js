import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.get('/', (_, res) => res.send('SCK Game Server ⚔️ running'));

const rooms      = new Map(); // roomCode → { [role]: socketId }
const onlineUsers = new Map(); // pseudo → socketId

io.on('connection', (socket) => {
    console.log(`[+] connect: ${socket.id}`);

    // ── Présence sociale ──────────────────────────────────────────
    socket.on('register-presence', ({ pseudo }) => {
        socket.data.pseudo = pseudo;
        onlineUsers.set(pseudo, socket.id);
        io.emit('presence-update', { pseudo, online: true });
        console.log(`[presence] ${pseudo} online (${onlineUsers.size} total)`);
    });

    socket.on('get-online-users', () => {
        const me = socket.data.pseudo;
        socket.emit('online-users', Array.from(onlineUsers.keys()).filter(p => p !== me));
    });

    socket.on('send-dm', ({ to, message }) => {
        const from = socket.data.pseudo;
        const targetId = onlineUsers.get(to);
        if (targetId) io.to(targetId).emit('dm-received', { from, message });
    });

    socket.on('send-invite', ({ to, roomCode, type }) => {
        const from = socket.data.pseudo;
        const targetId = onlineUsers.get(to);
        if (targetId) io.to(targetId).emit('invite-received', { from, roomCode, type });
    });

    // ── Rejoindre une room de jeu ─────────────────────────────────
    socket.on('join-game', ({ roomCode, pseudo, role, skinIndex }) => {
        socket.join(roomCode);
        socket.data = { ...socket.data, roomCode, pseudo, role, skinIndex };
        if (!rooms.has(roomCode)) rooms.set(roomCode, {});
        const room = rooms.get(roomCode);
        if (role === 'salon') room[socket.id] = socket.id;
        else room[role] = socket.id;
        socket.to(roomCode).emit('peer-joined', { pseudo, role, skinIndex });
        console.log(`[room ${roomCode}] ${pseudo} (${role}) joined`);
    });

    // ── État joueur (~60fps) ──────────────────────────────────────
    socket.on('player-state', (state) => {
        const { roomCode } = socket.data ?? {};
        if (roomCode) socket.to(roomCode).emit('peer-state', state);
    });

    // ── Sync ennemis / pièces / items (host → guest) ─────────────
    socket.on('enemy-sync', (data) => {
        const { roomCode } = socket.data ?? {};
        if (roomCode) socket.to(roomCode).emit('enemy-sync', data);
    });

    socket.on('coin-sync', (data) => {
        const { roomCode } = socket.data ?? {};
        if (roomCode) socket.to(roomCode).emit('coin-sync', data);
    });

    socket.on('item-sync', (data) => {
        const { roomCode } = socket.data ?? {};
        if (roomCode) socket.to(roomCode).emit('item-sync', data);
    });

    // ── Host démarre la partie ────────────────────────────────────
    socket.on('start-game', () => {
        const { roomCode } = socket.data ?? {};
        if (roomCode) {
            socket.to(roomCode).emit('game-start');
            console.log(`[room ${roomCode}] game-start`);
        }
    });

    // ── Événements de jeu (mort ennemi, VFX, score…) ─────────────
    socket.on('game-event', (event) => {
        const { roomCode } = socket.data ?? {};
        if (roomCode) socket.to(roomCode).emit('game-event', event);
    });

    // ── Déconnexion ───────────────────────────────────────────────
    socket.on('disconnect', () => {
        const { roomCode, pseudo, role } = socket.data ?? {};
        if (pseudo && onlineUsers.get(pseudo) === socket.id) {
            onlineUsers.delete(pseudo);
            io.emit('presence-update', { pseudo, online: false });
        }
        if (roomCode) {
            socket.to(roomCode).emit('peer-disconnected', { pseudo });
            const room = rooms.get(roomCode);
            if (room) {
                if (role === 'salon') delete room[socket.id];
                else delete room[role];
                if (Object.keys(room).length === 0) rooms.delete(roomCode);
            }
        }
        console.log(`[-] disconnect: ${pseudo ?? socket.id}`);
    });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => console.log(`SCK Server listening on :${PORT}`));
