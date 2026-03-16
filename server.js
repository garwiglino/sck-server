import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.get('/', (_, res) => res.send('SCK Game Server ⚔️ running'));

// rooms : roomCode -> { host: socketId, guest: socketId }
const rooms = new Map();

io.on('connection', (socket) => {
    console.log(`[+] connect: ${socket.id}`);

    // ── Rejoindre une room de jeu ─────────────────────────────────
    socket.on('join-game', ({ roomCode, pseudo, role, skinIndex }) => {
        socket.join(roomCode);
        socket.data = { roomCode, pseudo, role, skinIndex };

        if (!rooms.has(roomCode)) rooms.set(roomCode, {});
        rooms.get(roomCode)[role] = socket.id;

        // Notifier le partenaire déjà connecté
        socket.to(roomCode).emit('peer-joined', { pseudo, role, skinIndex });
        console.log(`[room ${roomCode}] ${pseudo} (${role}) joined`);
    });

    // ── Envoi de l'état du joueur (~20fps) ────────────────────────
    socket.on('player-state', (state) => {
        const { roomCode } = socket.data ?? {};
        if (roomCode) socket.to(roomCode).emit('peer-state', state);
    });

    // ── Host démarre la partie → notifie le guest ─────────────────
    socket.on('start-game', () => {
        const { roomCode } = socket.data ?? {};
        if (roomCode) {
            socket.to(roomCode).emit('game-start');
            console.log(`[room ${roomCode}] game-start`);
        }
    });

    // ── Événements de jeu (mort, victoire, etc.) ──────────────────
    socket.on('game-event', (event) => {
        const { roomCode } = socket.data ?? {};
        if (roomCode) socket.to(roomCode).emit('game-event', event);
    });

    // ── Déconnexion ───────────────────────────────────────────────
    socket.on('disconnect', () => {
        const { roomCode, pseudo, role } = socket.data ?? {};
        if (roomCode) {
            socket.to(roomCode).emit('peer-disconnected', { pseudo });
            const room = rooms.get(roomCode);
            if (room) {
                delete room[role];
                if (!room.host && !room.guest) rooms.delete(roomCode);
            }
        }
        console.log(`[-] disconnect: ${pseudo ?? socket.id}`);
    });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => console.log(`SCK Server listening on :${PORT}`));
