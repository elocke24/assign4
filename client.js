// Connect to the server using socket.io
const socket = io();

// Variables to keep track of the player and game state
let name = "", symbol = "", opponent = "", turn = "X";
let gameOver = false;

// When the user submits their name, send it to the server
function submitLogin() {
  name = document.getElementById("nameInput").value.trim();
  if (name) socket.emit("TO-SERVER LOGIN", name);
}

// If the name is already taken, show a message
socket.on("screenname-unavailable", () => {
  document.getElementById("loginMsg").innerText = "Name taken, try another.";
});

// If login is successful, hide the login and show the lobby
socket.on("LOGIN-OK", () => {
  document.getElementById("loginArea").style.display = "none";
  document.getElementById("lobbyArea").style.display = "block";
});

// When "New Game" is clicked, show X/O selection
function promptNewGame() {
  document.getElementById("newGameBtn").style.display = "none";
  document.getElementById("newGamePrompt").style.display = "block";
}

// Send the chosen side (X or O) to the server
function chooseSide(side) {
  socket.emit("NEW-GAME", { name, choice: side });
  document.getElementById("newGamePrompt").style.display = "none";
}

// Update the lobby list with current users and game status
socket.on("UPDATED-USER-LIST-AND-STATUS", (list) => {
  const div = document.getElementById("userList");
  div.innerHTML = "";
  list.forEach(item => {
    if (item.x && item.o) {
      // Show active game
      div.innerHTML += `<div>X: ${item.x} | O: ${item.o}</div>`;
    } else if (item.x || item.o) {
      // Show players waiting for a match
      const wait = item.x || item.o;
      if (wait !== name) {
        div.innerHTML += `<div>${item.x || "-"} | ${item.o || "-"} 
          <button onclick="join('${wait}')">JOIN</button></div>`;
      }
    } else {
      // Show idle players
      div.innerHTML += `<div>${item.name} (idle)</div>`;
    }
  });
});

// Ask to join someone's game
function join(opponentName) {
  if (opponentName === name) return;
  socket.emit("JOIN", { clientName: name, opponent: opponentName });
}

// When a game starts, set up the board
socket.on("PLAY", ({ x, o }) => {
  gameOver = false;
  symbol = x === name ? "X" : "O";
  opponent = x === name ? o : x;
  turn = "X";
  document.getElementById("lobbyArea").style.display = "none";
  document.getElementById("gameArea").style.display = "block";
  renderBoard();
  updateStatus();
});

// Draw the game board
function renderBoard() {
  const board = document.getElementById("board");
  board.innerHTML = "";
  for (let i = 1; i <= 9; i++) {
    board.innerHTML += `<button id="cell${i}" onclick="move(${i})"></button>`;
    if (i % 3 === 0) board.innerHTML += "<br>";
  }
}

// Show current game status (your symbol, turn, opponent)
function updateStatus() {
  document.getElementById("status").innerText = `You: ${symbol} | Opponent: ${opponent} | Turn: ${turn}`;
}

// When you click a cell
function move(cell) {
  if (turn !== symbol) return; // Not your turn
  const btn = document.getElementById("cell" + cell);
  if (btn.innerText !== "") return; // Cell already used
  btn.innerText = symbol;
  turn = symbol === "X" ? "O" : "X";
  socket.emit("MOVE", { name, cell });
  updateStatus();
  checkGameEnd();
}

// When the opponent moves
socket.on("MOVE", ({ cell, turn: newTurn, symbol: moveSymbol }) => {
  const btn = document.getElementById("cell" + cell);
  btn.innerText = moveSymbol;
  turn = newTurn;
  updateStatus();
  checkGameEnd();
});

// Check if the game ended (win or draw)
function checkGameEnd() {
  if (gameOver) return;

  const winCombos = [
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
    [1, 4, 7],
    [2, 5, 8],
    [3, 6, 9],
    [1, 5, 9],
    [3, 5, 7]
  ];

  const cells = Array.from({ length: 10 }, (_, i) =>
    document.getElementById("cell" + i)?.innerText
  );

  for (const [a, b, c] of winCombos) {
    if (cells[a] && cells[a] === cells[b] && cells[b] === cells[c]) {
      gameOver = true;

      // Only send win if you're the one who won
      if (cells[a] === symbol) {
        socket.emit("END-GAME", { result: "WIN", winner: name });
      }

      return;
    }
  }

  // If board is full and no winner, it’s a draw
  if (cells.slice(1).every(Boolean)) {
    gameOver = true;

    const movesByMe = cells.filter(cell => cell === symbol).length;
    const movesByThem = cells.filter(cell => cell && cell !== symbol).length;

    if (movesByMe === movesByThem || movesByMe === movesByThem + 1) {
      socket.emit("END-GAME", { result: "DRAW", winner: name });
    }
  }
}

// Show the result and disable board
socket.on("END-GAME", ({ result, winner }) => {
  const isWinner = winner === name;
  let message = " | Game Over: ";
  if (result === "DRAW") {
    message += "Draw!";
  } else {
    message += isWinner ? "You win!" : "You lose!";
  }
  document.getElementById("status").innerText += message;

  // Disable all buttons
  for (let i = 1; i <= 9; i++) {
    document.getElementById("cell" + i).disabled = true;
  }

  // Show new game button
  document.getElementById("newGameBtn").style.display = "block";
});

// Show how-to-play popup
function showHowToPlay() {
  document.getElementById("howToPlayOverlay").style.display = "block";
}

// Hide how-to-play popup
function closeHowToPlay() {
  document.getElementById("howToPlayOverlay").style.display = "none";
}
