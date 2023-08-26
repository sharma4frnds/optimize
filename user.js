const db = require('./database');

const init = async () => {
  await db.run('CREATE TABLE Users (id INTEGER PRIMARY KEY AUTOINCREMENT, name varchar(32));');
  await db.run('CREATE TABLE Friends (id INTEGER PRIMARY KEY AUTOINCREMENT, userId int, friendId int);');
  // await db.run(`
  //     CREATE TABLE Users (
  //         id INTEGER PRIMARY KEY AUTOINCREMENT,
  //         name varchar(32)
  //     );
  // `);

  // await db.run(`
  //     CREATE TABLE Friends (
  //         id INTEGER PRIMARY KEY AUTOINCREMENT,
  //         userId int,
  //         friendId int,
  //         UNIQUE(userId, friendId)
  //     );
  // `);


  db.run("CREATE INDEX idx_userId ON Friends(userId)", (err) => {
    if (err) {
      console.error("Error creating index on userId:", err.message);
    } else {
      console.log("Index on userId created successfully");
    }
  });

  // Index on friendId in Friends table
  db.run("CREATE INDEX idx_friendId ON Friends(friendId)", (err) => {
    if (err) {
      console.error("Error creating index on friendId:", err.message);
    } else {
      console.log("Index on friendId created successfully");
    }
  });

  // Composite Index on userId and friendId in Friends table
  db.run("CREATE INDEX idx_user_friend ON Friends(userId, friendId)", (err) => {
    if (err) {
      console.error("Error creating composite index:", err.message);
    } else {
      console.log("Composite index created successfully");
    }
  });
  const users = [];
  const names = ['foo', 'bar', 'baz'];
  for (i = 0; i < 1000; ++i) {
    let n = i;
    let name = '';
    for (j = 0; j < 3; ++j) {
      name += names[n % 3];
      n = Math.floor(n / 3);
      name += n % 10;
      n = Math.floor(n / 10);
    }
    users.push(name);
  }
  const friends = users.map(() => []);
  for (i = 0; i < friends.length; ++i) {
    const n = 10 + Math.floor(90 * Math.random());
    const list = [...Array(n)].map(() => Math.floor(friends.length * Math.random()));
    list.forEach((j) => {
      if (i === j) {
        return;
      }
      if (friends[i].indexOf(j) >= 0 || friends[j].indexOf(i) >= 0) {
        return;
      }
      friends[i].push(j);
      friends[j].push(i);
    });
  }
  console.log("Init Users Table...");
  await Promise.all(users.map((un) => db.run(`INSERT INTO Users (name) VALUES ('${un}');`)));
  console.log("Init Friends Table...");
  await Promise.all(friends.map((list, i) => {
    return Promise.all(list.map((j) => db.run(`INSERT INTO Friends (userId, friendId) VALUES (${i + 1}, ${j + 1});`)));
  }));
  console.log("Ready.");
}


const search = async (req, res) => {
  const query = req.params.query;
  const userId = parseInt(req.params.userId);

  const fetchConnectionSQL = `
  SELECT 
      id,
      name,
      CASE
          -- Check for 0th-degree connection
          --WHEN id IN (SELECT friendId from Friends where userId = ${userId}) THEN 0 
          WHEN id = ${userId} THEN 0 
          -- Check for 1st-degree connection
          WHEN id IN (SELECT friendId FROM Friends WHERE userId = ${userId}
                      UNION 
                      SELECT userId FROM Friends WHERE friendId = ${userId}) THEN 1
          -- Check for 2nd-degree connection
          WHEN id IN (SELECT DISTINCT f2.friendId 
                      FROM Friends f1
                      JOIN Friends f2 ON f1.friendId = f2.userId
                      WHERE f1.userId = ${userId} AND f2.friendId != ${userId} AND f2.friendId NOT IN (
                          SELECT friendId FROM Friends WHERE userId = ${userId} 
                          UNION 
                          SELECT userId FROM Friends WHERE friendId = ${userId})) THEN 2
          -- Check for 3rd-degree connection
            WHEN id IN (SELECT DISTINCT f3.friendId 
                        FROM Friends f1
                        JOIN Friends f2 ON f1.friendId = f2.userId
                        JOIN Friends f3 ON f2.friendId = f3.userId
                        WHERE f1.userId = ${userId} AND f3.friendId != ${userId}) THEN 3
            -- Check for 4th-degree connection
            WHEN id IN (SELECT DISTINCT f4.friendId 
                        FROM Friends f1
                        JOIN Friends f2 ON f1.friendId = f2.userId
                        JOIN Friends f3 ON f2.friendId = f3.userId
                        JOIN Friends f4 ON f3.friendId = f4.userId
                        WHERE f1.userId = ${userId} AND f4.friendId != ${userId}) THEN 4
            ELSE 0
      END AS connection
  FROM Users
  WHERE name LIKE '${query}%'
  LIMIT 20
`;

  // const fetchConnectionSQL2 = `SELECT id, name, id in (SELECT friendId from Friends where userId = ${userId}) as connection from Users where name LIKE '${query}%' LIMIT 20;`
  db.all(fetchConnectionSQL).then((results) => {
    res.statusCode = 200;
    res.json({
      success: true,
      users: results
    });
  }).catch((err) => {
    res.statusCode = 500;
    res.json({ success: false, error: err });
  });
}

const addfriend = async (req, res) => {

  const userId = parseInt(req.params.userId);
  const friendId = parseInt(req.params.friendId);

  try {
    if (userId === friendId) {
      return res.status(400).json({ success: false, message: "A user cannot friend themselves." });
    }

    db.run(`INSERT INTO Friends (userId, friendId) VALUES (${userId}, ${friendId});`);
    db.run(`INSERT INTO Friends (userId, friendId) VALUES (${friendId}, ${userId});`);
    res.status(200).json({ success: true, message: "Friend added successfully!" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to add friend. Error: " + error.message });
  }

}


const removefriend = async (req, res) => {
  const userId = parseInt(req.params.userId);
  const friendId = parseInt(req.params.friendId);
  // Ensure that a user does not try to remove themselves
  if (userId === friendId) {
    return res.status(400).json({ success: false, error: "Invalid operation. Users cannot unfriend themselves." });
  }

  try {
    // Check if they are actually friends
    const existingFriendship = await db.all('SELECT * FROM Friends WHERE userId = ? AND friendId = ?', [userId, friendId]);
    if (!existingFriendship) {
      return res.status(400).json({ success: false, error: "Users aren't friends to begin with." });
    }
    db.run(`DELETE FROM Friends WHERE userId = ${userId} AND friendId = ${friendId};`);
    db.run(`DELETE FROM Friends WHERE userId = ${friendId} AND friendId = ${userId};`);
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports.init = init;
module.exports.search = search;
module.exports.addfriend = addfriend;
module.exports.removefriend = removefriend;
