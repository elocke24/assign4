const socket = io();
let name = "", symbol = "", opponent = "", turn = "X";
let gameOver = false;

function submitLogin() {
  name = document.getElementById("nameInput").value.trim();
  if (name) socket.emit("TO-SERVER LOGIN", name);
}

socket.on("screenname-unavailable", () => {
  document.getElementById("loginMsg").innerText = "Name taken, try another.";
});

socket.on("LOGIN-OK", () => {
  document.getElementById("loginArea").style.display = "none";
  document.getElementById("lobbyArea").style.display = "block";
});

function promptNewGame() {
  document.getElementById("newGameBtn").style.display = "none";
  document.getElementById("newGamePrompt").style.display = "block";
}

function chooseSide(side) {
  socket.emit("NEW-GAME", { name, choice: side });
  document.getElementById("newGamePrompt").style.display = "none";
}

socket.on("UPDATED-USER-LIST-AND-STATUS", (list) => {
  const div = document.getElementById("userList");
  div.innerHTML = "";
  list.forEach(item => {
    if (item.x && item.o) {
      div.innerHTML += `<div>X: ${item.x} | O: ${item.o}</div>`;
    } else if (item.x || item.o) {
      const wait = item.x || item.o;
      if (wait !== name) {
        div.innerHTML += `<div>${item.x || "-"} | ${item.o || "-"} 
          <button onclick="join('${wait}')">JOIN</button></div>`;
      }
    } else {
      div.innerHTML += `<div>${item.name} (idle)</div>`;
    }
  });
});

function join(opponentName) {
  if (opponentName === name) return;
  socket.emit("JOIN", { clientName: name, opponent: opponentName });
}

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

function renderBoard() {
  const board = document.getElementById("board");
  board.innerHTML = "";
  for (let i = 1; i <= 9; i++) {
    board.innerHTML += `<button id="cell${i}" onclick="move(${i})"></button>`;
    if (i % 3 === 0) board.innerHTML += "<br>";
  }
}

function updateStatus() {
  document.getElementById("status").innerText = `You: ${symbol} | Opponent: ${opponent} | Turn: ${turn}`;
}

function move(cell) {
  if (turn !== symbol) return;
  const btn = document.getElementById("cell" + cell);
  if (btn.innerText !== "") return;
  btn.innerText = symbol;
  turn = symbol === "X" ? "O" : "X";
  socket.emit("MOVE", { name, cell });
  updateStatus();
  checkGameEnd();
}

socket.on("MOVE", ({ cell, turn: newTurn, symbol: moveSymbol }) => {
  const btn = document.getElementById("cell" + cell);
  btn.innerText = moveSymbol;
  turn = newTurn;
  updateStatus();
  checkGameEnd();
});

function checkGameEnd() {
  if (gameOver) return; // Prevent re-checking if game is already over

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

      // Only the player who just made the move should emit END-GAME
      if (cells[a] === symbol) {
        socket.emit("END-GAME", { result: "WIN", winner: name });
      }

      return;
    }
  }

  // If all cells are filled and no winner, it's a draw
  if (cells.slice(1).every(Boolean)) {
    gameOver = true;
    
    // Emit draw only if last move was yours
    const movesByMe = cells.filter(cell => cell === symbol).length;
    const movesByThem = cells.filter(cell => cell && cell !== symbol).length;

    if (movesByMe === movesByThem || movesByMe === movesByThem + 1) {
      socket.emit("END-GAME", { result: "DRAW", winner: name });
    }
  }
}


socket.on("END-GAME", ({ result, winner }) => {
  const isWinner = winner === name;
  let message = " | Game Over: ";
  if (result === "DRAW") {
    message += "Draw!";
  } else {
    message += isWinner ? "You win!" : "You lose!";
  }
  document.getElementById("status").innerText += message;

  // Disable the board
  for (let i = 1; i <= 9; i++) {
    document.getElementById("cell" + i).disabled = true;
  }

  // Show "New Game" button
  document.getElementById("newGameBtn").style.display = "block";
});

function showHowToPlay() {
    document.getElementById("howToPlayOverlay").style.display = "block";
  }

  function closeHowToPlay() {
    document.getElementById("howToPlayOverlay").style.display = "none";
  }
