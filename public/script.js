const socket = io();

const playButton = document.getElementById('play-button');
const roomSelection = document.getElementById('room-selection');
const appContainer = document.getElementById('app-container');
const gameContainer = document.getElementById('game-container');
const turnSpan = document.getElementById('turn');
const displayRoomId = document.getElementById('display-room-id');
const playerIdSpan = document.getElementById('player-id');
const phaseSpan = document.getElementById('phase');
const piecesToPlaceSpan = document.getElementById('pieces-to-place');
const boardDiv = document.getElementById('board');
const playerBadge = document.getElementById('player-badge');
const playerNameInput = document.getElementById('player-name');
const playerNamesDiv = document.getElementById('player-names');
const notificationContainer = document.getElementById('notification-container');
const waitingMessage = document.getElementById('waiting-message');
const moveSound = document.getElementById('move-sound');
const removeSound = document.getElementById('remove-sound');
const millSound = document.getElementById('mill-sound');
const turnSwitchSound = document.getElementById('turn-switch-sound');

const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');
const emojiBtn = document.getElementById('emoji-btn');

const picker = new EmojiButton();

picker.on('emoji', emoji => {
    chatInput.value += emoji;
});

emojiBtn.addEventListener('click', () => {
    picker.togglePicker(emojiBtn);
});

let player = null;
let selectedPiece = null;

const coordMap = [50, 150, 250, 300, 350, 450, 550];

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

const playerNameSidebar = document.createElement('div');

function drawBoard(board) {
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
        const isFilled = board && board[pos.x] && board[pos.x][pos.y];
        const point = document.createElement('div');
        point.classList.add('point');
        if (isFilled) point.classList.add('filled');
        point.style.left = `${coordMap[pos.x]}px`;
        point.style.top = `${coordMap[pos.y]}px`;
        point.dataset.x = pos.x;
        point.dataset.y = pos.y;
        point.dataset.index = i;
        if (!isFilled) point.addEventListener('click', handlePointClick);
        boardDiv.appendChild(point);
    });
}

function updateBoard(board) {
    document.querySelectorAll('.piece').forEach(p => p.remove());
    drawBoard(board);
    positions.forEach((pos) => {
        const cell = board[pos.x][pos.y];
        if (cell) {
            const piece = document.createElement('div');
            piece.classList.add('piece', cell);
            piece.style.left = `${coordMap[pos.x]}px`;
            piece.style.top = `${coordMap[pos.y]}px`;
            piece.dataset.x = pos.x;
            piece.dataset.y = pos.y;
            piece.addEventListener('click', handlePieceClick);
            boardDiv.appendChild(piece);
        }
    });
}

function handlePointClick(e) {
    const x = parseInt(e.target.dataset.x);
    const y = parseInt(e.target.dataset.y);
    const phase = phaseSpan.textContent;
    if (!positions.some(p => p.x === x && p.y === y)) return;
    if (phase === 'placing') {
        socket.emit('placePiece', { position: { x, y } });
    } else if (phase === 'moving' || phase === 'flying') {
        if (selectedPiece) {
            const from = {
                x: parseInt(selectedPiece.dataset.x),
                y: parseInt(selectedPiece.dataset.y)
            };
            if (!positions.some(p => p.x === from.x && p.y === from.y)) return;
            socket.emit('movePiece', { from, to: { x, y } });
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
        socket.emit('removePiece', { position: { x, y } });
    } else if (phase === 'moving' || phase === 'flying') {
        if (selectedPiece) {
            selectedPiece.classList.remove('selected');
        }
        selectedPiece = piece;
        selectedPiece.classList.add('selected');
    }
}

function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'toast-notification';
    notification.textContent = message;
    notificationContainer.appendChild(notification);
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

playButton.addEventListener('click', () => {
    const name = playerNameInput.value.trim();
    socket.emit('findGame', { name });
    playButton.disabled = true;
    playButton.textContent = 'Finding Game...';
});

chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (chatInput.value) {
        socket.emit('sendMessage', chatInput.value);
        chatInput.value = '';
    }
});

socket.on('newMessage', (data) => {
    const { senderId, senderName, text } = data;
    
    const wasScrolledToBottom = chatMessages.scrollHeight - chatMessages.clientHeight <= chatMessages.scrollTop + 1;

    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    
    const senderElement = document.createElement('div');
    senderElement.classList.add('sender');
    senderElement.textContent = senderName;
    
    const textElement = document.createElement('div');
    textElement.textContent = text;
    
    messageElement.appendChild(senderElement);
    messageElement.appendChild(textElement);

    if (senderId === socket.id) {
        messageElement.classList.add('my-message');
    } else {
        messageElement.classList.add('other-message');
    }
    
    chatMessages.appendChild(messageElement);

    if (wasScrolledToBottom) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
});

socket.on('waitingForOpponent', () => {
    roomSelection.classList.add('hidden');
    appContainer.classList.remove('hidden');
    waitingMessage.classList.remove('hidden');
    drawBoard(Array(7).fill(null).map(() => Array(7).fill(null)));
});

function updatePlayerNames(players) {
    playerNamesDiv.innerHTML = '';
    for (const id in players) {
        const p = players[id];
        const playerEl = document.createElement('div');
        playerEl.textContent = p.name;
        playerEl.className = `badge badge-${p.player}`;
        playerNamesDiv.appendChild(playerEl);
    }
}

socket.on('gameUpdate', (data) => {
    waitingMessage.classList.add('hidden');
    
    if (!player) {
        player = data.yourPlayerId;
        const myPlayerInfo = Object.values(data.players).find(p => p.id === socket.id);
        if (myPlayerInfo) {
            playerBadge.textContent = myPlayerInfo.name;
        } else {
            playerBadge.textContent = player; // Fallback
        }
        playerBadge.className = `badge badge-${player}`;
    }

    roomSelection.classList.add('hidden');
    appContainer.classList.remove('hidden');
    gameContainer.classList.remove('hidden');

    updatePlayerNames(data.players);
    updateBoard(data.board);
    turnSpan.textContent = data.turn;
    phaseSpan.textContent = data.phase || 'placing';
    
    const myPlayerInfo = Object.values(data.players).find(p => p.id === socket.id);
    if(myPlayerInfo) {
        piecesToPlaceSpan.textContent = myPlayerInfo.piecesToPlace;
    }

    if (data.sound === 'turnChange') {
        if (turnSwitchSound) turnSwitchSound.play();
    } else if (data.sound === 'mill') {
        const turnPlayer = Object.values(data.players).find(p => p.player === data.turn);
        const millPlayerName = turnPlayer ? turnPlayer.name : 'A player';
        showNotification(`${millPlayerName} formed a mill! Remove an opponent's piece.`);
        if (millSound) millSound.play();
    }
});

socket.on('updatePhase', (phase) => {
    phaseSpan.textContent = phase;
});

socket.on('gameOver', (data) => {
    showNotification(`Game Over! ${data.winnerName} wins!`);
    phaseSpan.textContent = 'Game Over';
    turnSpan.textContent = '-';
});

socket.on('playerDisconnect', () => {
    showNotification('Your opponent has disconnected. Game over.');
    phaseSpan.textContent = 'Opponent Disconnected';
    turnSpan.textContent = '-';
    // Optionally reset the game view
    setTimeout(() => {
        appContainer.classList.add('hidden');
        gameContainer.classList.add('hidden');
        roomSelection.classList.remove('hidden');
        playButton.disabled = false;
        playButton.textContent = 'Play Game';
        player = null;
    }, 5000);
});

socket.on('gameFull', () => {
    showNotification('Sorry, the game is currently full. Please try again later.');
    playButton.disabled = false;
    playButton.textContent = 'Play Game';
});

// Initial board drawing
drawBoard(Array(7).fill(null).map(() => Array(7).fill(null))); 