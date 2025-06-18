// Bring in required modules
const http = require("http");
const fs = require("fs");
const socketIo = require("socket.io");
const db = require("./config"); // This connects to our MySQL database

// Set up the web server
const server = http.createServer((req, res) => {
  // When someone visits "/", send them the HTML page
  if (req.url === "/") {
    fs.readFile("index.html", (err, data) => {
      if (err) return res.end("Error loading page.");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(data);
    });
  }
  // If the browser requests the JS file, send that
  else if (req.url === "/client.js") {
    fs.readFile("client.js", (err, data) => {
      if (err) return res.end("Error loading JS.");
      res.writeHead(200, { "Content-Type": "application/javascript" });
      res.end(data);
    });
  }
});

// Attach socket.io to the server
const io = socketIo(server);

// Keep track of connected users and their socket IDs
let sockets = {}; // screenname -> socket.id

// Send updated user/game status to everyone
function broadcastStatus() {
  db.query("SELECT * FROM users", (err, users) => {
    db.query("SELECT * FROM players", (err2, rows) => {
      const status = users.map(u => {
        const name = u.screenname;
        const found = rows.find(r => r.x_player === name || r.o_player === name);
        return { name, x: found?.x_player || "", o: found?.o_player || "" };
      });
      io.emit("UPDATED-USER-LIST-AND-STATUS", status);
    });
  });
}

// This runs every time a user connects
io.on("connection", socket => {

  // Handle login
  socket.on("TO-SERVER LOGIN", name => {
    name = name.trim();
    if (!name) return;

    // Check if name is already in use
    db.query("SELECT screenname FROM users WHERE screenname = ?", [name], (err, results) => {
      if (err) {
        console.error("Database error:", err);
        socket.emit("server-error", "Database query failed.");
        return;
      }

      if (results.length > 0) {
        socket.emit("screenname-unavailable");
      } else {
        // Save the name to the users table
        db.query("INSERT INTO users(screenname) VALUES(?)", [name], () => {
          sockets[name] = socket.id; // Save socket ID
          socket.screenname = name;  // Save name on the socket
          db.query("SELECT * FROM users", (err2, results2) => {
            socket.emit("LOGIN-OK", results2);
            broadcastStatus(); // Tell everyone who’s online
          });
        });
      }
    });
  });

  // Handle starting a new game as X or O
  socket.on("NEW-GAME", ({ name, choice }) => {
    // Remove user from any previous game slot
    db.query("DELETE FROM players WHERE x_player=? OR o_player=?", [name, name], () => {
      if (choice === "X") {
        db.query("INSERT INTO players(x_player) VALUES(?)", [name], broadcastStatus);
      } else {
        db.query("INSERT INTO players(o_player) VALUES(?)", [name], broadcastStatus);
      }
    });
  });

  // Handle a JOIN request to start a match
  socket.on("JOIN", ({ clientName, opponent }) => {
    if (clientName === opponent) return;

    // Clear any previous games for both players
    db.query("DELETE FROM players WHERE x_player=? OR o_player=?", [clientName, clientName], () => {
      db.query("DELETE FROM players WHERE x_player=? OR o_player=?", [opponent, opponent], () => {
        // Set up a new game pairing
        db.query("INSERT INTO players(x_player, o_player) VALUES(?,?)", [opponent, clientName], () => {
          broadcastStatus();

          const xSock = io.to(sockets[opponent]);
          const oSock = io.to(sockets[clientName]);

          // Tell both players to start the game
          xSock.emit("PLAY", { x: opponent, o: clientName });
          oSock.emit("PLAY", { x: opponent, o: clientName });
        });
      });
    });
  });

  // Handle a player making a move
  socket.on("MOVE", ({ name, cell }) => {
    db.query("SELECT * FROM players WHERE x_player=? OR o_player=?", [name, name], (err, rows) => {
      if (rows.length === 0) return;

      const game = rows[0];
      const opponent = game.x_player === name ? game.o_player : game.x_player;
      const symbol = game.x_player === name ? "X" : "O";
      const nextTurn = symbol === "X" ? "O" : "X";

      // Send move to both players
      if (sockets[opponent]) {
        io.to(sockets[opponent]).emit("MOVE", { cell, turn: nextTurn, symbol });
      }
      io.to(sockets[name]).emit("MOVE", { cell, turn: nextTurn, symbol });
    });
  });

  // Handle the end of a game (win or draw)
  socket.on("END-GAME", ({ result, winner }) => {
    // Remove both players from the game list
    db.query("DELETE FROM players WHERE x_player=? OR o_player=?", [winner, winner], () => {
      const opp = Object.keys(sockets).find(n => n !== winner);

      // Notify both players of the result
      io.to(sockets[winner]).emit("END-GAME", { result, winner });
      if (opp) io.to(sockets[opp]).emit("END-GAME", { result, winner });

      broadcastStatus();
    });
  });

  // Handle disconnect (player leaves the site)
  socket.on("disconnect", () => {
    const name = socket.screenname;
    if (!name) return;

    // Remove the player from both users and any game
    db.query("DELETE FROM users WHERE screenname=?", [name], () => {
      db.query("DELETE FROM players WHERE x_player=? OR o_player=?", [name, name], () => {
        broadcastStatus();
      });
    });
  });
});

// Start the server on port 8081
server.listen(8081, () => console.log("Server running on http://localhost:8081"));
