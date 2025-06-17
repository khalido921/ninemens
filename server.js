const express = require('express');
const http = require('http');
const socketio = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketio(server);

// Serve static files from the 'public' directory
app.use(express.static('public'));

let game = createInitialGameState();

const validPositions = [
    { x: 0, y: 0 }, { x: 3, y: 0 }, { x: 6, y: 0 }, // 0, 1, 2
    { x: 1, y: 1 }, { x: 3, y: 1 }, { x: 5, y: 1 }, // 3, 4, 5
    { x: 2, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 }, // 6, 7, 8
    { x: 0, y: 3 }, { x: 1, y: 3 }, { x: 2, y: 3 }, // 9, 10, 11
    { x: 4, y: 3 }, { x: 5, y: 3 }, { x: 6, y: 3 }, // 12, 13, 14
    { x: 2, y: 4 }, { x: 3, y: 4 }, { x: 4, y: 4 }, // 15, 16, 17
    { x: 1, y: 5 }, { x: 3, y: 5 }, { x: 5, y: 5 }, // 18, 19, 20
    { x: 0, y: 6 }, { x: 3, y: 6 }, { x: 6, y: 6 }  // 21, 22, 23
];

const mills = [
    // Outer square
    [0, 1, 2], [0, 9, 21], [21, 22, 23], [2, 14, 23],
    // Middle square
    [3, 4, 5], [3, 10, 18], [18, 19, 20], [5, 13, 20],
    // Inner square
    [6, 7, 8], [6, 11, 15], [15, 16, 17], [8, 12, 17],
    // Connecting lines
    [1, 4, 7], [9, 10, 11], [16, 19, 22], [12, 13, 14]
];

const adjacencies = {
    0: [1, 9], 1: [0, 2, 4], 2: [1, 14],
    3: [4, 10], 4: [1, 3, 5, 7], 5: [4, 13],
    6: [7, 11], 7: [4, 6, 8], 8: [7, 12],
    9: [0, 10, 21], 10: [3, 9, 11, 18], 11: [6, 10],
    12: [8, 13, 17], 13: [5, 12, 14, 20], 14: [2, 13],
    15: [11, 16], 16: [15, 17, 19], 17: [12, 16],
    18: [10, 19], 19: [16, 18, 20, 22], 20: [5, 19],
    21: [9, 22], 22: [19, 21, 23], 23: [2, 22]
};

io.on('connection', (socket) => {
    console.log(`New connection: ${socket.id}`);

    socket.on('findGame', ({ name }) => {
        const numPlayers = Object.keys(game.players).length;
        if (numPlayers >= 2) {
            socket.emit('gameFull');
            return;
        }

        const playerRole = numPlayers === 0 ? 'player1' : 'player2';
        const playerName = name || (playerRole === 'player1' ? 'Player 1' : 'Player 2');
        
        game.players[socket.id] = { 
            id: socket.id,
            player: playerRole, 
            name: playerName, 
            piecesToPlace: 9, 
            piecesOnBoard: 0 
        };

        if (numPlayers === 0) {
            socket.emit('waitingForOpponent');
            console.log(`${playerName} connected as Player 1, waiting for opponent.`);
        } else {
            game.turn = 'player1';
            game.phase = 'placing';
            
            Object.values(game.players).forEach(p => {
                 io.to(p.id).emit('gameUpdate', {
                    board: game.board,
                    turn: game.players[Object.keys(game.players)[0]].name,
                    phase: game.phase,
                    players: game.players,
                    yourPlayerId: p.player
                });
            });

            const p1Name = getPlayerByRole('player1')?.name;
            const p2Name = getPlayerByRole('player2')?.name;
            console.log(`${p1Name} vs ${p2Name}. Game starting.`);
        }
    });

    socket.on('placePiece', ({ position }) => {
        if (!game.players[socket.id]) return;
        
        const player = game.players[socket.id];
        if (game.turn !== player.player || game.phase !== 'placing' || !isValidPosition(position)) {
            return;
        }

        if (game.board[position.x][position.y] === null) {
            game.board[position.x][position.y] = player.player;
            player.piecesToPlace--;
            player.piecesOnBoard++;

            const wasMill = isMill(position, game.board, player.player);
            
            if (wasMill) {
                game.phase = 'removing';
                io.emit('mill', { player: player.name });
            } else {
                game.turn = player.player === 'player1' ? 'player2' : 'player1';
                if (Object.values(game.players).every(p => p.piecesToPlace === 0)) {
                    game.phase = 'moving';
                }
            }
            broadcastGameUpdate({ sound: wasMill ? 'mill' : 'turnChange' });
        }
    });

    socket.on('movePiece', ({ from, to }) => {
        if (!game.players[socket.id]) return;

        const player = game.players[socket.id];
        if (game.turn !== player.player || (game.phase !== 'moving' && game.phase !== 'flying')) {
            return;
        }

        if (isValidMove(from, to, game.board, player.player, player.piecesOnBoard)) {
            game.board[from.x][from.y] = null;
            game.board[to.x][to.y] = player.player;
            
            if (checkForWinByNoMoves()) return;

            const wasMill = isMill(to, game.board, player.player);

            if (wasMill) {
                game.phase = 'removing';
                io.emit('mill', { player: player.name });
            } else {
                game.turn = player.player === 'player1' ? 'player2' : 'player1';
            }
            updatePhaseForPlayers();
            broadcastGameUpdate({ sound: wasMill ? 'mill' : 'turnChange' });
        }
    });

    socket.on('removePiece', ({ position }) => {
        if (!game.players[socket.id]) return;

        const player = game.players[socket.id];
        const opponentRole = player.player === 'player1' ? 'player2' : 'player1';
        
        if (game.phase !== 'removing' || game.turn !== player.player) {
            return;
        }
        
        const opponentSocket = Object.values(game.players).find(p => p.player === opponentRole);
        if (!opponentSocket) return; 

        if (!canRemovePiece(position, opponentRole)) {
            return;
        }

        game.board[position.x][position.y] = null;
        opponentSocket.piecesOnBoard--;

        if (opponentSocket.piecesToPlace === 0 && opponentSocket.piecesOnBoard < 3) {
            io.emit('gameOver', { winnerName: player.name });
            game = createInitialGameState();
            return;
        }

        game.turn = player.player === 'player1' ? 'player2' : 'player1';
        
        if (checkForWinByNoMoves()) return;

        updatePhaseForPlayers();
        broadcastGameUpdate({ sound: 'turnChange' });
    });
    
    socket.on('disconnect', () => {
        console.log(`Disconnected: ${socket.id}`);
        if (game.players[socket.id]) {
            delete game.players[socket.id];
            
            if (Object.keys(game.players).length < 2) {
                const remainingPlayerSocketId = Object.keys(game.players)[0];
                if (remainingPlayerSocketId) {
                    io.to(remainingPlayerSocketId).emit('playerDisconnect');
                }
                game = createInitialGameState();
                console.log('Game reset due to player disconnect.');
            }
        }
    });
});

function createInitialGameState() {
    return {
        players: {},
        board: Array(7).fill(null).map(() => Array(7).fill(null)),
        turn: null,
        phase: 'waiting'
    };
}

function getPlayerByRole(role) {
    return Object.values(game.players).find(p => p.player === role);
}

function broadcastGameUpdate(options = {}) {
    const turnPlayer = getPlayerByRole(game.turn);
    io.emit('gameUpdate', {
        board: game.board,
        turn: turnPlayer ? turnPlayer.name : '',
        phase: game.phase,
        players: game.players,
        sound: options.sound || null
    });
}

function updatePhaseForPlayers() {
    const p1 = getPlayerByRole('player1');
    const p2 = getPlayerByRole('player2');

    if (!p1 || !p2) return;

    if (p1.piecesToPlace === 0 && p2.piecesToPlace === 0) {
        if (p1.piecesOnBoard === 3) p1.phase = 'flying'; else p1.phase = 'moving';
        if (p2.piecesOnBoard === 3) p2.phase = 'flying'; else p2.phase = 'moving';
        
        const currentPlayer = getPlayerByRole(game.turn);
        if (currentPlayer) {
            game.phase = currentPlayer.phase || 'moving';
        }
    } else {
        game.phase = 'placing';
    }
}

function isMill(position, board, player) {
    const posIndex = validPositions.findIndex(p => p.x === position.x && p.y === position.y);
    if (posIndex === -1) return false;

    for (const mill of mills) {
        if (mill.includes(posIndex)) {
            const [p1, p2, p3] = mill;
            const pos1 = validPositions[p1];
            const pos2 = validPositions[p2];
            const pos3 = validPositions[p3];

            if (board[pos1.x][pos1.y] === player &&
                board[pos2.x][pos2.y] === player &&
                board[pos3.x][pos3.y] === player) {
                return true;
            }
        }
    }
    return false;
}

function areAllOpponentPiecesInMill(board, opponentPlayer) {
    const opponentPieces = [];
    validPositions.forEach(pos => {
        if (board[pos.x][pos.y] === opponentPlayer) {
            opponentPieces.push(pos);
        }
    });

    if (opponentPieces.length === 0) return false;

    for (const pos of opponentPieces) {
        if (!isMill(pos, board, opponentPlayer)) {
            return false;
        }
    }
    return true;
}

function canRemovePiece(position, opponentRole) {
    if (!game.board[position.x][position.y] || game.board[position.x][position.y] !== opponentRole) {
        return false;
    }
    const isTargetInMill = isMill(position, game.board, opponentRole);
    const allOpponentInMill = areAllOpponentPiecesInMill(game.board, opponentRole);
    
    return !isTargetInMill || allOpponentInMill;
}

function getAdjacentPositions(position) {
    const posIndex = validPositions.findIndex(p => p.x === position.x && p.y === position.y);
    if (posIndex === -1) return [];
    
    const adjacentIndices = adjacencies[posIndex] || [];
    return adjacentIndices.map(index => validPositions[index]);
}

function hasValidMoves(board, player, playerPiecesOnBoard) {
    const playerRole = player;
    const pieces = [];
    for (let i = 0; i < validPositions.length; i++) {
        const pos = validPositions[i];
        if (board[pos.x][pos.y] === playerRole) {
            pieces.push(pos);
        }
    }

    for (const piece of pieces) {
        const adjacent = getAdjacentPositions(piece);
        for (const adj of adjacent) {
            if (board[adj.x][adj.y] === null) {
                return true; // Found a valid move
            }
        }
    }

    return false; // No valid moves found
}

function checkForWinByNoMoves() {
    const opponentRole = game.turn === 'player1' ? 'player2' : 'player1';
    const opponent = getPlayerByRole(opponentRole);

    if (opponent && opponent.piecesToPlace === 0) {
        if (!hasValidMoves(game.board, opponent.player, opponent.piecesOnBoard)) {
            const winner = getPlayerByRole(game.turn);
            io.emit('gameOver', { winnerName: winner.name });
            game = createInitialGameState();
            return true;
        }
    }
    return false;
}

function isValidPosition(pos) {
    return validPositions.some(p => p.x === pos.x && p.y === pos.y);
}

function isValidMove(from, to, board, player, piecesOnBoard) {
    if (board[to.x][to.y] !== null) return false;

    if (piecesOnBoard < 4) { // Flying phase (not 3, because this is before the move)
        return true;
    }
    
    // Moving phase
    const adjacent = getAdjacentPositions(from);
    return adjacent.some(p => p.x === to.x && p.y === to.y);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`)); 