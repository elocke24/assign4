const mysql = require("mysql2");
const db = mysql.createConnection({
  host: "localhost",
  user: "436_mysql_user",
  password: "123pwd456",
  database: "436db"
});

db.connect(err => {
  if (err) throw err;
  console.log("Connected to MySQL");
});

module.exports = db;
