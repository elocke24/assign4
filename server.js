const http = require("http");
const fs = require("fs");
const socketIo = require("socket.io");
const db = require("./config");

const server = http.createServer((req, res) => {
  if (req.url === "/") {
    fs.readFile("index.html", (err, data) => {
      if (err) return res.end("Error loading page.");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(data);
    });
  } else if (req.url === "/client.js") {
    fs.readFile("client.js", (err, data) => {
      if (err) return res.end("Error loading JS.");
      res.writeHead(200, { "Content-Type": "application/javascript" });
      res.end(data);
    });
  }
});

const io = socketIo(server);

let sockets = {}; // screenname -> socket.id

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

io.on("connection", socket => {
  socket.on("TO-SERVER LOGIN", name => {
    name = name.trim();
    if (!name) return;

    db.query("SELECT screenname FROM users WHERE screenname = ?", [name], (err, results) => {
      if (err) {
        console.error("Database error:", err);
        socket.emit("server-error", "Database query failed.");
        return;
      }

      if (results.length > 0) {
        socket.emit("screenname-unavailable");
      } else {
        db.query("INSERT INTO users(screenname) VALUES(?)", [name], () => {
          sockets[name] = socket.id;
          socket.screenname = name;
          db.query("SELECT * FROM users", (err2, results2) => {
            socket.emit("LOGIN-OK", results2);
            broadcastStatus();
          });
        });
      }
    });
  });

  socket.on("NEW-GAME", ({ name, choice }) => {
    db.query("DELETE FROM players WHERE x_player=? OR o_player=?", [name, name], () => {
      if (choice === "X") {
        db.query("INSERT INTO players(x_player) VALUES(?)", [name], broadcastStatus);
      } else {
        db.query("INSERT INTO players(o_player) VALUES(?)", [name], broadcastStatus);
      }
    });
  });

  socket.on("JOIN", ({ clientName, opponent }) => {
    if (clientName === opponent) return;
    db.query("DELETE FROM players WHERE x_player=? OR o_player=?", [clientName, clientName], () => {
      db.query("DELETE FROM players WHERE x_player=? OR o_player=?", [opponent, opponent], () => {
        db.query("INSERT INTO players(x_player, o_player) VALUES(?,?)", [opponent, clientName], () => {
          broadcastStatus();
          const xSock = io.to(sockets[opponent]);
          const oSock = io.to(sockets[clientName]);
          xSock.emit("PLAY", { x: opponent, o: clientName });
          oSock.emit("PLAY", { x: opponent, o: clientName });
        });
      });
    });
  });

  socket.on("MOVE", ({ name, cell }) => {
    db.query("SELECT * FROM players WHERE x_player=? OR o_player=?", [name, name], (err, rows) => {
      if (rows.length === 0) return;
      const game = rows[0];
      const opponent = game.x_player === name ? game.o_player : game.x_player;
      const symbol = game.x_player === name ? "X" : "O";
      const nextTurn = symbol === "X" ? "O" : "X";

      if (sockets[opponent]) {
        io.to(sockets[opponent]).emit("MOVE", { cell, turn: nextTurn, symbol });
      }
      io.to(sockets[name]).emit("MOVE", { cell, turn: nextTurn, symbol });
    });
  });

  socket.on("END-GAME", ({ result, winner }) => {
    db.query("DELETE FROM players WHERE x_player=? OR o_player=?", [winner, winner], () => {
      const opp = Object.keys(sockets).find(n => n !== winner);
      io.to(sockets[winner]).emit("END-GAME", { result, winner });
      if (opp) io.to(sockets[opp]).emit("END-GAME", { result, winner });
      broadcastStatus();
    });
  });

  socket.on("disconnect", () => {
    const name = socket.screenname;
    if (!name) return;
    db.query("DELETE FROM users WHERE screenname=?", [name], () => {
      db.query("DELETE FROM players WHERE x_player=? OR o_player=?", [name, name], () => {
        broadcastStatus();
      });
    });
  });
});

server.listen(8081, () => console.log("Server running on http://localhost:8081"));
