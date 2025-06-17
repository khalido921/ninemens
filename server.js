const express = require('express');
const http = require('http');
const socketio = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketio(server);

// Serve static files from the 'public' directory
app.use(express.static('public'));

let rooms = {};

io.on('connection', (socket) => {
    console.log('New WebSocket connection');

    socket.on('createRoom', (roomId) => {
        if (rooms[roomId]) {
            return socket.emit('error', 'Room already exists');
        }
        rooms[roomId] = { players: {}, board: null, turn: null, phase: 'placing' };
        rooms[roomId].players[socket.id] = { player: 'player1', piecesToPlace: 9, piecesOnBoard: 0 };
        socket.join(roomId);
        socket.emit('roomCreated', roomId);
        console.log(`Room ${roomId} created`);
    });

    socket.on('joinRoom', (roomId) => {
        if (!rooms[roomId]) {
            return socket.emit('error', 'Room does not exist');
        }
        if (Object.keys(rooms[roomId].players).length >= 2) {
            return socket.emit('error', 'Room is full');
        }
        
        const player = 'player2';
        rooms[roomId].players[socket.id] = { player: player, piecesToPlace: 9, piecesOnBoard: 0 };
        socket.join(roomId);
        
        io.in(roomId).emit('playerJoined', { roomId, player: 'player1' });

        // Start the game
        const board = createInitialBoard();
        rooms[roomId].board = board;
        rooms[roomId].turn = 'player1';

        io.in(roomId).emit('startGame', { board, turn: 'player1', players: rooms[roomId].players });
        console.log(`Player joined room ${roomId}`);
    });

    socket.on('placePiece', (data) => {
        const { roomId, position } = data;
        const room = rooms[roomId];
        const playerSocketId = socket.id;
        const player = room.players[playerSocketId].player;

        if (room.turn !== player || room.phase !== 'placing') {
            return;
        }

        if (room.board[position.x][position.y] === null) {
            room.board[position.x][position.y] = player;
            room.players[playerSocketId].piecesToPlace--;
            room.players[playerSocketId].piecesOnBoard++;
            
            if (isMill(position, room.board, player)) {
                room.phase = 'removing';
                io.in(roomId).emit('updateBoard', room.board);
                io.in(roomId).emit('millFormed', { player });
            } else {
                room.turn = player === 'player1' ? 'player2' : 'player1';
                if (room.players['player1']?.piecesToPlace === 0 && room.players['player2']?.piecesToPlace === 0) {
                    room.phase = 'moving';
                }
                io.in(roomId).emit('updateBoard', room.board);
                io.in(roomId).emit('updateTurn', { turn: room.turn, phase: room.phase });
            }
        }
    });

    socket.on('movePiece', (data) => {
        const { roomId, from, to } = data;
        const room = rooms[roomId];
        const playerSocketId = socket.id;
        const player = room.players[playerSocketId].player;

        if (room.turn !== player || room.phase !== 'moving' && room.phase !== 'flying') {
            return;
        }

        if (isValidMove(from, to, room.board, player, room.players[playerSocketId].piecesOnBoard)) {
            room.board[from.x][from.y] = null;
            room.board[to.x][to.y] = player;

            if (isMill(to, room.board, player)) {
                room.phase = 'removing';
                io.in(roomId).emit('updateBoard', room.board);
                io.in(roomId).emit('millFormed', { player });
            } else {
                room.turn = player === 'player1' ? 'player2' : 'player1';
                io.in(roomId).emit('updateBoard', room.board);
                io.in(roomId).emit('updateTurn', { turn: room.turn, phase: room.phase });
            }
        }
    });

    socket.on('removePiece', (data) => {
        const { roomId, position } = data;
        const room = rooms[roomId];
        const playerSocketId = socket.id;
        const player = room.players[playerSocketId].player;
        const opponent = player === 'player1' ? 'player2' : 'player1';

        if (room.phase !== 'removing' || room.turn !== player) {
            return;
        }

        if (room.board[position.x][position.y] === opponent && !isMill(position, room.board, opponent)) {
            room.board[position.x][position.y] = null;
            
            const opponentSocketId = Object.keys(room.players).find(id => room.players[id].player === opponent);
            room.players[opponentSocketId].piecesOnBoard--;

            if (room.players[opponentSocketId].piecesOnBoard < 3 && room.players[opponentSocketId].piecesToPlace === 0) {
                 io.in(roomId).emit('gameOver', { winner: player });
                 delete rooms[roomId];
                 return;
            }

            room.turn = player === 'player1' ? 'player2' : 'player1';
            room.phase = (room.players['player1'].piecesToPlace > 0 || room.players['player2'].piecesToPlace > 0) ? 'placing' : (room.players[opponentSocketId].piecesOnBoard < 4 ? 'flying' : 'moving');
            
            if(room.players['player1'].piecesToPlace === 0 && room.players['player2'].piecesToPlace === 0) {
                room.phase = 'moving';
                if(room.players[playerSocketId].piecesOnBoard < 4) room.phase = 'flying';
            }


            io.in(roomId).emit('updateBoard', room.board);
            io.in(roomId).emit('updateTurn', { turn: room.turn, phase: room.phase });
        }
    });
    
    socket.on('disconnect', () => {
        console.log('WebSocket disconnected');
        for (const roomId in rooms) {
            if (rooms[roomId].players[socket.id]) {
                delete rooms[roomId].players[socket.id];
                if (Object.keys(rooms[roomId].players).length === 0) {
                    delete rooms[roomId];
                    console.log(`Room ${roomId} deleted`);
                } else {
                    io.in(roomId).emit('playerLeft', { roomId });
                }
            }
        }
    });
});

function createInitialBoard() {
    return Array(7).fill(null).map(() => Array(7).fill(null));
}

function isMill(position, board, player) {
    const { x, y } = position;

    // Check horizontal mill
    if ((y === 0 || y === 6) && board[x][0] === player && board[x][3] === player && board[x][6] === player) return true;
    if ((y === 1 || y === 5) && board[x][1] === player && board[x][3] === player && board[x][5] === player) return true;
    if ((y === 2 || y === 4) && board[x][2] === player && board[x][3] === player && board[x][4] === player) return true;

    // Check vertical mill
    if ((x === 0 || x === 6) && board[0][y] === player && board[3][y] === player && board[6][y] === player) return true;
    if ((x === 1 || x === 5) && board[1][y] === player && board[3][y] === player && board[5][y] === player) return true;
    if ((x === 2 || x === 4) && board[2][y] === player && board[3][y] === player && board[4][y] === player) return true;

    return false;
}

function isValidMove(from, to, board, player, piecesOnBoard) {
    if (board[to.x][to.y] !== null) return false;

    if (piecesOnBoard === 3) { // Flying phase
        return true;
    }
    
    // Moving phase
    const dx = Math.abs(from.x - to.x);
    const dy = Math.abs(from.y - to.y);

    if (dx + dy !== 1) { // Not adjacent
        if((from.x % 3 !== 0 && from.y % 3 !== 0) || (to.x % 3 !== 0 && to.y % 3 !== 0)){
            return false
        }
    }
    
    return true;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`)); 