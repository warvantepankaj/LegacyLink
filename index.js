import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import session from "express-session";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const port = 3000;

// Middleware setup
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
  })
);

// PostgreSQL database connection
const db = new pg.Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT
});

db.connect()
  .then(() => console.log("Connected to PostgreSQL"))
  .catch((err) => console.error("Database connection error:", err));

app.set("view engine", "ejs");

// Routes
app.get("/", (req, res) => {
  res.render("mainpage.ejs", { error: null });
});
app.get("/alumni_login", (req, res) => {
  res.render("alumni_login.ejs", { error: null });
});

app.get("/student_login", (req, res) => {
  res.render("student_login.ejs", { error: null });
});

app.get("/admin_login", (req, res) => {
  res.render("admin_login.ejs", { error: null });
});

// Student home route
app.get("/student_home", async (req, res) => {
  if (req.session.user) {
    try {
      const studentResult = await db.query(`SELECT * FROM students WHERE prn = $1`, [req.session.user.prn]);
      const postsResult = await db.query(`
        SELECT 
          posts.*, 
          COUNT(DISTINCT likes.id) AS like_count, 
          COUNT(DISTINCT comments.id) AS comment_count,
          EXISTS (
            SELECT 1 FROM likes WHERE likes.post_id = posts.id AND likes.user_prn = $1
          ) AS user_liked
        FROM posts
        LEFT JOIN likes ON posts.id = likes.post_id
        LEFT JOIN comments ON posts.id = comments.post_id
        GROUP BY posts.id
        ORDER BY posts.created_at DESC
      `, [req.session.user.prn]);

      const commentsResult = await db.query(`
        SELECT 
          comments.*, 
          students.name AS student_name, 
          alumni.name AS alumni_name 
        FROM comments
        LEFT JOIN students ON comments.user_prn = students.prn
        LEFT JOIN alumni ON comments.user_prn = alumni.prn
        ORDER BY comments.created_at ASC
      `);

      if (studentResult.rows.length > 0) {
        res.render("home.ejs", {
          user: studentResult.rows[0],
          posts: postsResult.rows,
          comments: commentsResult.rows,
        });
      } else {
        res.redirect("/student_login");
      }
    } catch (err) {
      console.error(err);
      res.status(500).send("Internal Server Error");
    }
  } else {
    res.redirect("/student_login");
  }
});

// Alumni home route
app.get("/alumni_home", async (req, res) => {
  if (req.session.alumni) {
    try {
      const alumniResult = await db.query(`SELECT * FROM alumni WHERE prn = $1`, [req.session.alumni.prn]);
      const postsResult = await db.query(`
        SELECT 
          posts.*, 
          COUNT(DISTINCT likes.id) AS like_count, 
          COUNT(DISTINCT comments.id) AS comment_count,
          EXISTS (
            SELECT 1 FROM likes WHERE likes.post_id = posts.id AND likes.user_prn = $1
          ) AS user_liked
        FROM posts
        LEFT JOIN likes ON posts.id = likes.post_id
        LEFT JOIN comments ON posts.id = comments.post_id
        GROUP BY posts.id
        ORDER BY posts.created_at DESC
      `, [req.session.alumni.prn]);

      const commentsResult = await db.query(`
        SELECT 
          comments.*, 
          students.name AS student_name, 
          alumni.name AS alumni_name 
        FROM comments
        LEFT JOIN students ON comments.user_prn = students.prn
        LEFT JOIN alumni ON comments.user_prn = alumni.prn
        ORDER BY comments.created_at ASC
      `);

      if (alumniResult.rows.length > 0) {
        res.render("home.ejs", {
          user: alumniResult.rows[0],
          posts: postsResult.rows,
          comments: commentsResult.rows,
        });
      } else {
        res.redirect("/alumni_login");
      }
    } catch (err) {
      console.error(err);
      res.status(500).send("Internal Server Error");
    }
  } else {
    res.redirect("/alumni_login");
  }
});

// Admin home route
app.get("/admin_home", async (req, res) => {
  if (req.session.admin) {
    try {
      // Fetch admin details
      const adminResult = await db.query(`SELECT * FROM admin WHERE username = $1`, [req.session.admin.username]);

      // Fetch counts for alumni, students, and posts
      const alumniCountResult = await db.query("SELECT COUNT(*) AS count FROM alumni");
      const studentCountResult = await db.query("SELECT COUNT(*) AS count FROM students");
      const postCountResult = await db.query("SELECT COUNT(*) AS count FROM posts");

      // Extract counts
      const alumniCount = alumniCountResult.rows[0].count;
      const studentCount = studentCountResult.rows[0].count;
      const postCount = postCountResult.rows[0].count;

      // Fetch recent posts
      const postsResult = await db.query("SELECT * FROM posts ORDER BY created_at DESC LIMIT 10");

      if (adminResult.rows.length > 0) {
        // Render the admin dashboard with all the data
        res.render("admin/admin_home.ejs", {
          user: adminResult.rows[0],
          alumniCount,
          studentCount,
          postCount,
          posts: postsResult.rows,
        });
      } else {
        res.redirect("/admin_login");
      }
    } catch (err) {
      console.error("Error fetching admin dashboard data:", err);
      res.status(500).send("Internal Server Error");
    }
  } else {
    res.redirect("/admin_login");
  }
});

// Student login
app.post("/student_login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const result = await db.query("SELECT * FROM students WHERE prn = $1 AND password = $2", [username, password]);

    if (result.rows.length > 0) {
      req.session.user = {
        prn: username,
        name: result.rows[0].name,
        batch_year: result.rows[0].batch_year,
        type: "student",
      };
      res.redirect("/student_home");
    } else {
      res.render("student_login.ejs", { error: "Invalid PRN or password." });
    }
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
});

// Alumni login
app.post("/alumni_login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const result = await db.query("SELECT * FROM alumni WHERE prn = $1 AND password = $2", [username, password]);

    if (result.rows.length > 0) {
      req.session.alumni = {
        prn: username,
        name: result.rows[0].name,
        batch_year: result.rows[0].batch_year,
        type: "alumni",
      };
      res.redirect("/alumni_home");
    } else {
      res.render("alumni_login.ejs", { error: "Invalid PRN or password." });
    }
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
});

// Admin login
app.post("/admin_login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const result = await db.query("SELECT * FROM admin WHERE username = $1 AND password = $2", [username, password]);

    if (result.rows.length > 0) {
      req.session.admin = {
        username: username,
        name: result.rows[0].name || username, // Use name or fallback to username
        type: "admin",
      };
      res.redirect("/admin_home");
    } else {
      res.render("admin_login.ejs", { error: "Invalid username or password." });
    }
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
});

// Route to create a new post
app.post("/create_post", async (req, res) => {
  const { title, content } = req.body;
  const user = req.session.user || req.session.alumni || req.session.admin; // Check for logged-in user

  if (!user) {
    return res.redirect("/login"); // Redirect to login if the user is not logged in
  }

  try {
    // Determine author_name and other fields
    const authorName = user.name || user.username || "Unknown Author";
    let userType;
    let redirectPath;

    if (req.session.user) {
      userType = "student";
      redirectPath = "/student_home";
    } else if (req.session.alumni) {
      userType = "alumni";
      redirectPath = "/alumni_home";
    } else if (req.session.admin) {
      userType = "admin";
      redirectPath = "/admin_home";
    } else {
      userType = "unknown"; // Fallback value (should not happen)
      redirectPath = "/login";
    }

    const userPrn = user.prn || user.username;
    const batchYear = user.batch_year || 0;

    // Insert the new post into the database
    await db.query(
      `INSERT INTO posts (user_prn, user_type, author_name, batch_year, title, content, created_at) 
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [userPrn, userType, authorName, batchYear, title, content]
    );

    // Redirect to the appropriate home page
    res.redirect(redirectPath);
  } catch (err) {
    console.error("Error creating post:", err);
    res.status(500).send("Internal Server Error");
  }
});

// Route to delete a post
app.delete("/delete_post/:id", async (req, res) => {
  const postId = req.params.id;
  const user = req.session.user || req.session.alumni || req.session.admin;

  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Verify that the post belongs to the user
    const postResult = await db.query(
      "SELECT * FROM posts WHERE id = $1 AND user_prn = $2",
      [postId, user.prn || user.username]
    );

    if (postResult.rows.length === 0) {
      return res.status(403).json({ error: "You are not authorized to delete this post." });
    }

    // Delete the post
    await db.query("DELETE FROM posts WHERE id = $1", [postId]);

    res.json({ success: true, message: "Post deleted successfully." });
  } catch (err) {
    console.error("Error deleting post:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});



//admin functionalities 
// Render Add Alumni Form
app.get("/add_alumni", (req, res) => {
  if (req.session.admin) {
    res.render("admin/add_alumni");
  } else {
    res.redirect("/admin_login");
  }
});

app.post("/add_alumni", async (req, res) => {
  const { prn, name, email, password, department, batch_year, current_position, company, location } = req.body;

  // Validate input
  if (!prn || !name || !email || !password || !department || !batch_year || !current_position || !company || !location) {
    return res.status(400).send("All fields are required.");
  }

  try {
    // Insert the new alumni into the database
    await db.query(
      "INSERT INTO alumni (prn, name, email, password, department, batch_year, current_position, company, location, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())",
      [prn, name, email, password, department, batch_year, current_position, company, location]
    );

    // Redirect back to the admin dashboard or a success page
    res.redirect("/admin_home");
  } catch (err) {
    console.error("Error adding alumni:", err);
    res.status(500).send("Internal Server Error");
  }
});

// Render Add Student Form
app.get("/add_student", (req, res) => {
  if (req.session.admin) {
    res.render("admin/add_student");
  } else {
    res.redirect("/admin_login");
  }
});

app.post("/add_student", async (req, res) => {
  const { prn, name, email, password, department, batch_year } = req.body;

  // Validate input
  if (!prn || !name || !email || !password || !department || !batch_year) {
    return res.status(400).send("All fields are required.");
  }

  try {
    // Insert the new student into the database
    await db.query(
      "INSERT INTO students (prn, name, email, password, department, batch_year, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW())",
      [prn, name, email, password, department, batch_year]
    );

    // Redirect back to the admin dashboard or a success page
    res.redirect("/admin_home");
  } catch (err) {
    console.error("Error adding student:", err);
    res.status(500).send("Internal Server Error");
  }
});

// Render Alumni List
app.get("/alumni_list", async (req, res) => {
  if (req.session.admin) {
    try {
      const alumniResult = await db.query("SELECT * FROM alumni ORDER BY batch_year DESC");
      res.render("admin/alumni_list", { alumni: alumniResult.rows });
    } catch (err) {
      console.error("Error fetching alumni list:", err);
      res.status(500).send("Internal Server Error");
    }
  } else {
    res.redirect("/admin_login");
  }
});

// Render Students List
app.get("/students_list", async (req, res) => {
  if (req.session.admin) {
    try {
      const studentsResult = await db.query("SELECT * FROM students ORDER BY batch_year DESC");
      res.render("admin/students_list", { students: studentsResult.rows });
    } catch (err) {
      console.error("Error fetching students list:", err);
      res.status(500).send("Internal Server Error");
    }
  } else {
    res.redirect("/admin_login");
  }
});

app.get("/import_students", (req, res) => {
  const user = req.session.admin; // Ensure only admins can access this page
  if (!user) {
    return res.redirect("/login");
  }

  res.render("admin/import");
});

// Route to import students to alumni
app.post("/import_students_to_alumni", async (req, res) => {
  const { batch_year, current_position, company, location } = req.body;

  // Validate input
  if (!batch_year || !current_position || !company || !location) {
    return res.status(400).send("All fields are required.");
  }

  try {
    // Fetch students from the students table based on the batch year
    const students = await db.query(
      "SELECT prn, name, email, password, department FROM students WHERE batch_year = $1",
      [batch_year]
    );

    if (students.rows.length === 0) {
      return res.status(404).send("No students found for the given batch year.");
    }

    // Insert each student into the alumni table with additional fields
    for (const student of students.rows) {
      await db.query(
        "INSERT INTO alumni (prn, name, email, password, department, batch_year, current_position, company, location, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())",
        [
          student.prn,
          student.name,
          student.email,
          student.password,
          student.department,
          batch_year,
          current_position,
          company,
          location,
        ]
      );
    }

    // Redirect back to the admin dashboard with a success message
    res.redirect("/admin_home");
  } catch (err) {
    console.error("Error importing students to alumni:", err);
    res.status(500).send("Internal Server Error");
  }
});

// Route to logout
app.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying session:", err);
      return res.status(500).send("Internal Server Error");
    }
    res.redirect("/"); // Redirect to the login page after logout
  });
});

// Route to like a post
app.post("/like_post/:id", async (req, res) => {
  const postId = req.params.id;
  const user = req.session.user || req.session.alumni || req.session.admin;

  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const likeResult = await db.query(
      "SELECT * FROM likes WHERE post_id = $1 AND user_prn = $2",
      [postId, user.prn || user.username]
    );

    let userLiked;
    if (likeResult.rows.length > 0) {
      // Unlike the post
      await db.query("DELETE FROM likes WHERE post_id = $1 AND user_prn = $2", [
        postId,
        user.prn || user.username,
      ]);
      userLiked = false;
    } else {
      // Like the post
      await db.query(
        "INSERT INTO likes (post_id, user_prn) VALUES ($1, $2)",
        [postId, user.prn || user.username]
      );
      userLiked = true;
    }

    // Get the updated like count
    const likeCountResult = await db.query(
      "SELECT COUNT(*) AS like_count FROM likes WHERE post_id = $1",
      [postId]
    );

    res.json({
      userLiked,
      likeCount: likeCountResult.rows[0].like_count,
    });
  } catch (err) {
    console.error("Error toggling like:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Route to add a comment
app.post("/comment_post/:id", async (req, res) => {
  const postId = req.params.id;
  const { comment } = req.body;
  const user = req.session.user || req.session.alumni || req.session.admin;

  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Validate the comment input
  if (!comment || comment.trim() === "") {
    return res.status(400).json({ error: "Comment cannot be empty!" });
  }

  try {
    const authorName = user.name;
    await db.query(
      "INSERT INTO comments (post_id, user_prn, comment) VALUES ($1, $2, $3)",
      [postId, user.prn || user.username, comment.trim()]
    );

    // Handle AJAX requests
    if (req.xhr || req.headers.accept.indexOf("json") > -1) {
      return res.json({
        authorName,
        comment: comment.trim(),
      });
    }

    // Handle non-AJAX requests (fallback)
    const referrer = req.get("Referrer") || "/";
res.redirect(referrer);
  } catch (err) {
    console.error("Error adding comment:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Delete comment route
app.post("/delete_comment/:id", async (req, res) => {
  const commentId = req.params.id;
  const user = req.session.user || req.session.alumni || req.session.admin;

  if (!user) {
    return res.status(401).send("Unauthorized");
  }

  try {
    // Verify that the comment belongs to the user
    const commentResult = await db.query(
      "SELECT * FROM comments WHERE id = $1 AND user_prn = $2",
      [commentId, user.prn || user.username]
    );

    if (commentResult.rows.length === 0) {
      return res.status(403).send("You are not authorized to delete this comment.");
    }

    // Delete the comment
    await db.query("DELETE FROM comments WHERE id = $1", [commentId]);

    // Redirect back to the referring page or fallback to "/"
    const referrer = req.get("Referrer") || "/";
    res.redirect(referrer);
  } catch (err) {
    console.error("Error deleting comment:", err);
    res.status(500).send("Internal Server Error");
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
