const socket = io();

const roomIdInput = document.getElementById('room-id');
const createRoomBtn = document.getElementById('create-room');
const joinRoomBtn = document.getElementById('join-room');
const roomSelection = document.getElementById('room-selection');
const gameContainer = document.getElementById('game-container');
const displayRoomId = document.getElementById('display-room-id');
const playerIdSpan = document.getElementById('player-id');
const turnSpan = document.getElementById('turn');
const phaseSpan = document.getElementById('phase');
const piecesToPlaceSpan = document.getElementById('pieces-to-place');
const boardDiv = document.getElementById('board');

let roomId = null;
let player = null;
let selectedPiece = null;

const boardLayout = [
    [0, 3, 6], [1, 3, 5], [2, 3, 4],
    [0, 3, 0], [1, 3, 1], [2, 3, 2],
    [0, 3, 6], [1, 3, 5], [2, 3, 4]
];

const positions = [
    { x: 0, y: 0 }, { x: 3, y: 0 }, { x: 6, y: 0 },
    { x: 1, y: 1 }, { x: 3, y: 1 }, { x: 5, y: 1 },
    { x: 2, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 },
    { x: 0, y: 3 }, { x: 1, y: 3 }, { x: 2, y: 3 },
    { x: 4, y: 3 }, { x: 5, y: 3 }, { x: 6, y: 3 },
    { x: 2, y: 4 }, { x: 3, y: 4 }, { x: 4, y: 4 },
    { x: 1, y: 5 }, { x: 3, y: 5 }, { x: 5, y: 5 },
    { x: 0, y: 6 }, { x: 3, y: 6 }, { x: 6, y: 6 }
];

function drawBoard() {
    boardDiv.innerHTML = '';
    const boardSize = 600;
    const lines = [
        // Outer square
        [{x:50, y:50}, {x:550, y:50}],
        [{x:550, y:50}, {x:550, y:550}],
        [{x:550, y:550}, {x:50, y:550}],
        [{x:50, y:550}, {x:50, y:50}],
        // Middle square
        [{x:150, y:150}, {x:450, y:150}],
        [{x:450, y:150}, {x:450, y:450}],
        [{x:450, y:450}, {x:150, y:450}],
        [{x:150, y:450}, {x:150, y:150}],
        // Inner square
        [{x:250, y:250}, {x:350, y:250}],
        [{x:350, y:250}, {x:350, y:350}],
        [{x:350, y:350}, {x:250, y:350}],
        [{x:250, y:350}, {x:250, y:250}],
        // Connecting lines
        [{x:300, y:50}, {x:300, y:250}],
        [{x:550, y:300}, {x:350, y:300}],
        [{x:300, y:550}, {x:300, y:350}],
        [{x:50, y:300}, {x:250, y:300}]
    ];

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', boardSize);
    svg.setAttribute('height', boardSize);

    lines.forEach(line => {
        const lineEl = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        lineEl.setAttribute('x1', line[0].x);
        lineEl.setAttribute('y1', line[0].y);
        lineEl.setAttribute('x2', line[1].x);
        lineEl.setAttribute('y2', line[1].y);
        lineEl.setAttribute('stroke', 'black');
        lineEl.setAttribute('stroke-width', 2);
        svg.appendChild(lineEl);
    });
    
    boardDiv.appendChild(svg);
    
    positions.forEach((pos, i) => {
        const point = document.createElement('div');
        point.classList.add('point');
        point.style.left = `${50 + pos.x * (500 / 6)}px`;
        point.style.top = `${50 + pos.y * (500 / 6)}px`;
        point.dataset.x = pos.x;
        point.dataset.y = pos.y;
        point.dataset.index = i;
        point.addEventListener('click', handlePointClick);
        boardDiv.appendChild(point);
    });
}

function updateBoard(board) {
    document.querySelectorAll('.piece').forEach(p => p.remove());
    board.forEach((row, y) => {
        row.forEach((cell, x) => {
            if (cell) {
                const piece = document.createElement('div');
                piece.classList.add('piece', cell);
                const pos = positions.find(p => p.x === x && p.y === y);
                if (pos) {
                    piece.style.left = `${50 + pos.x * (500 / 6)}px`;
                    piece.style.top = `${50 + pos.y * (500 / 6)}px`;
                    piece.dataset.x = x;
                    piece.dataset.y = y;
                    piece.addEventListener('click', handlePieceClick);
                    boardDiv.appendChild(piece);
                }
            }
        });
    });
}

function handlePointClick(e) {
    const x = parseInt(e.target.dataset.x);
    const y = parseInt(e.target.dataset.y);
    const phase = phaseSpan.textContent;

    if (phase === 'placing') {
        socket.emit('placePiece', { roomId, position: { x, y } });
    } else if (phase === 'moving' || phase === 'flying') {
        if (selectedPiece) {
            const from = {
                x: parseInt(selectedPiece.dataset.x),
                y: parseInt(selectedPiece.dataset.y)
            };
            socket.emit('movePiece', { roomId, from, to: { x, y } });
            selectedPiece.classList.remove('selected');
            selectedPiece = null;
        }
    }
}

function handlePieceClick(e) {
    const x = parseInt(e.target.dataset.x);
    const y = parseInt(e.target.dataset.y);
    const phase = phaseSpan.textContent;
    const piece = e.target;

    if (phase === 'removing') {
        socket.emit('removePiece', { roomId, position: { x, y } });
    } else if (phase === 'moving' || phase === 'flying') {
        if (selectedPiece) {
            selectedPiece.classList.remove('selected');
        }
        selectedPiece = piece;
        selectedPiece.classList.add('selected');
    }
}

createRoomBtn.addEventListener('click', () => {
    const id = roomIdInput.value.trim();
    if (id) {
        socket.emit('createRoom', id);
    }
});

joinRoomBtn.addEventListener('click', () => {
    const id = roomIdInput.value.trim();
    if (id) {
        socket.emit('joinRoom', id);
    }
});

socket.on('roomCreated', (id) => {
    roomId = id;
    player = 'player1';
    roomSelection.classList.add('hidden');
    gameContainer.classList.remove('hidden');
    displayRoomId.textContent = id;
    playerIdSpan.textContent = '1';
    drawBoard();
});

socket.on('playerJoined', (data) => {
    // This is received by player1
    console.log('Player 2 joined');
});

socket.on('startGame', (data) => {
    // This is received by both players
    roomId = roomIdInput.value.trim();
    if (!player) {
        player = 'player2';
        playerIdSpan.textContent = '2';
    }
    
    roomSelection.classList.add('hidden');
    gameContainer.classList.remove('hidden');
    displayRoomId.textContent = roomId;

    updateBoard(data.board);
    turnSpan.textContent = data.turn;
    phaseSpan.textContent = data.phase || 'placing';
    piecesToPlaceSpan.textContent = data.players[socket.id]?.piecesToPlace || 9;
    drawBoard();
    updateBoard(data.board);
});


socket.on('updateBoard', (board) => {
    updateBoard(board);
});

socket.on('updateTurn', (data) => {
    turnSpan.textContent = data.turn;
    phaseSpan.textContent = data.phase;
    const myPlayerData = Object.values(data.players || {}).find(p => p.id === socket.id);
    if(myPlayerData) {
        piecesToPlaceSpan.textContent = myPlayerData.piecesToPlace;
    }
});

socket.on('millFormed', (data) => {
    phaseSpan.textContent = 'removing';
    alert(`Player ${data.player} formed a mill! Remove an opponent's piece.`);
});


socket.on('gameOver', (data) => {
    alert(`Game Over! Winner is ${data.winner}`);
    roomSelection.classList.remove('hidden');
    gameContainer.classList.add('hidden');
});

socket.on('error', (message) => {
    alert(message);
});

socket.on('playerLeft', () => {
    alert('The other player has left the game.');
    roomSelection.classList.remove('hidden');
    gameContainer.classList.add('hidden');
});

drawBoard(); 