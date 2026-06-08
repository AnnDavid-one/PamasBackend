// index.js
import passport from "passport";
import passportGoogle from "passport-google-oauth20";
import session from "express-session";
import express from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import cors from "cors";
import dotenv from "dotenv";
import winston from "winston";
import morgan from "morgan";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";  // Add this line with your other imports
import job from "./lib/cron.js"; // Import the cron job







dotenv.config();



// User Schema
const userSchema = new mongoose.Schema({
  googleId: { type: String, required: true },
  name: String,
  email: { type: String, required: true, unique: true },
  picture: String,
}, { timestamps: true });

const User = mongoose.model("User", userSchema);




const { Strategy: GoogleStrategy } = passportGoogle;

const app = express();

// Setup Winston Logger
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp(),
    winston.format.printf(
      (info) => `${info.timestamp} ${info.level}: ${info.message}`
    )
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "app.log" }),
  ],
});

// Middleware for logging HTTP requests using Morgan
app.use(morgan("combined", { stream: { write: (msg) => logger.info(msg.trim()) } }));


// Dynamic CORS setup
const allowedOrigins = process.env.FRONTEND_URL 
  ? process.env.FRONTEND_URL.split(",") 
  : ["http://localhost:3000"];

// Middleware setup
app.use(express.json());
app.use(cors({
  origin: allowedOrigins, // Allow requests only from the frontend
  credentials: true, // Enable cookies (session cookies)
}));

// // Initialize Passport.js
// passport.use(
//   new GoogleStrategy(
//     {
//       clientID: process.env.GOOGLE_CLIENT_ID,
//       clientSecret: process.env.GOOGLE_CLIENT_SECRET,
//       callbackURL: "http://localhost:5000/auth/google/callback",
//     },
//     (accessToken, refreshToken, profile, done) => {
//       logger.info("Google profile:", profile); // Log successful login
//       return done(null, profile);
//     }
//   )
// );
passport.use(
  new GoogleStrategy(
  {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      // Fallback to localhost if the variable isn't set (local development)
      callbackURL: process.env.NODE_ENV === "production" 
      // note render handles the callback and loggic, you don't need to add a node_env in your environmental variables, so we just need to point to it. The frontend will handle the token in the query params and redirect as needed.
        ? "https://pamasbackend-qhu8.onrender.com/auth/google/callback"
        : "http://localhost:5000/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // Log the profile to see what data we actually get
        console.log("Google Profile:", JSON.stringify(profile, null, 2));
        
        // Safely extract user data with fallbacks
        const googleId = profile.id;
        const name = profile.displayName || profile.name?.givenName + " " + profile.name?.familyName || "User";
        const email = profile.emails?.[0]?.value || profile._json?.email || null;
        const picture = profile.photos?.[0]?.value || profile._json?.picture || "";
        
        if (!email) {
          logger.error("No email found in Google profile:", profile);
          return done(new Error("Email not found from Google"), null);
        }
        
        // Find or create user in database
        let user = await User.findOne({ googleId: googleId });
        
        if (!user) {
          user = await User.create({
            googleId: googleId,
            name: name,
            email: email,
            picture: picture,
          });
          logger.info(`New user created: ${user.email}`);
        } else {
          // Update user info if needed
          user.name = name;
          user.picture = picture;
          await user.save();
          logger.info(`Existing user logged in: ${user.email}`);
        }
        
        return done(null, user);
      } catch (error) {
        logger.error("Database error:", error);
        return done(error, null);
      }
    }
  )
);

// Serialize and deserialize user into the session
passport.serializeUser((user, done) => done(null, user.id));

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});
// passport.serializeUser((user, done) => done(null, user.id));
// passport.deserializeUser((user, done) => done(null, user));

// Session configuration
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
  })
);

app.use(passport.initialize());
app.use(passport.session());

// Route to start Google login
app.get("/auth/google", passport.authenticate("google", {
  scope: ["profile", "email"], // Request profile and email access
}));

// Google callback route
// Google callback route - FIXED VERSION
app.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login-failed" }),
  (req, res) => {
    // After successful authentication, req.user is the MongoDB user object
    const payload = { 
      id: req.user._id, 
      email: req.user.email,
      name: req.user.name,
      picture: req.user.picture
    };

    const token = jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    // Dynamic redirect destination
    const frontendBase = process.env.FRONTEND_REDIRECT_URL || "http://localhost:3000";
    res.redirect(`${frontendBase}?token=${token}`);
    // res.redirect(`http://localhost:3000?token=${token}`);
  }
);

// Add this failure route
// app.get("/login-failed", (req, res) => {
//   res.redirect("http://localhost:3000?error=login_failed");
// });

// Dynamic failure redirect
app.get("/login-failed", (req, res) => {
  const frontendBase = process.env.FRONTEND_REDIRECT_URL || "http://localhost:3000";
  res.redirect(`${frontendBase}?error=login_failed`);
});





//

// 2. The Middleware you liked
const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        // If no token, check if there's a Passport session as a fallback
        if (req.isAuthenticated()) return next();
        return res.status(401).json({ message: "No token provided" });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).json({ message: "Invalid or expired token" });
        req.user = decoded; // Attach the decoded user (id, email)
        next();
    });
};




// // Profile route to get user info if you're using sessions, or if you have a valid JWT. This is where the frontend can fetch the user's profile after login.
// app.get("/profile", verifyToken, (req, res) => {
//   // If it's a JWT, req.user has our payload. 
//     // If it's Passport, req.user has the full Google object. We want to send a clean profile to the frontend in either case.
//   if (req.isAuthenticated()) {
//     const userForFrontend = {
//       id: req.user.id,
//       name: req.user.displayName, // Mapping displayName to name
//       email: req.user.emails && req.user.emails[0] ? req.user.emails[0].value : "",
//       picture: req.user.photos && req.user.photos[0] ? req.user.photos[0].value : ""
//     };

//     console.log("Sending cleaned user profile:", userForFrontend.name);
//     res.json(userForFrontend);
//     console.log("User profile accessed:", userForFrontend); // Log profile access
//   } else {
//     res.status(401).json({ message: "Not authenticated" });
//   }
// });



// Profile route to get user info
app.get("/profile", verifyToken, (req, res) => {
  // Since we already verified the token in verifyToken middleware, 
  // req.user is now available (decoded JWT or session data).
  
  const userForFrontend = {
    id: req.user.id,
    name: req.user.name || req.user.displayName, // Name from JWT or Passport session
    email: req.user.email || req.user.emails?.[0]?.value, // Email from JWT or Passport session
    picture: req.user.picture || req.user.photos?.[0]?.value, // Picture from JWT or Passport session
  };

  console.log("Sending cleaned user profile:", userForFrontend.name);
  res.json(userForFrontend);
  console.log("User profile accessed:", userForFrontend); // Log profile access
});

// Protected route: Dashboard (only accessible to logged-in users)
app.get("/dashboard", verifyToken, (req, res) => {
  if (!req.isAuthenticated()) {
    logger.warn("Unauthorized access attempt to dashboard."); // Log unauthorized access
    return res.redirect("/");
  }
  logger.info(`Dashboard accessed by user: ${req.user.displayName}`); // Log when user accesses the dashboard
  res.send(`<h1>Welcome, ${req.user.displayName}</h1><a href='/logout'>Logout</a>`);
});

// Logout route
app.get("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    logger.info("User logged out successfully."); // Log logout
    res.redirect("/");
  });
});

// Home route (with Google login button)
app.get("/", (req, res) => {
  res.send("<h1>Welcome! <a href='/auth/google'>Login with Google</a></h1>");
});

// Google Generative AI Integration (example route)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getStatusCode = (error) => {
  return (
    error?.status ||
    error?.statusCode ||
    error?.response?.status ||
    error?.cause?.status ||
    null
  );
};

const shouldRetry = (error) => {
  const status = getStatusCode(error);
  const code = error?.code;

  return (
    status === 429 ||
    (typeof status === "number" && status >= 500) ||
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    code === "ENOTFOUND" ||
    code === "EAI_AGAIN"
  );
};

const generateWithRetry = async (model, prompt, options = {}) => {
  const { retries = 3, baseDelayMs = 1000, maxDelayMs = 8000 } = options;

  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      lastError = error;

      const isLastAttempt = attempt === retries;
      if (isLastAttempt || !shouldRetry(error)) {
        throw error;
      }

      const delay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
      logger.warn(`Gemini request failed. Retrying in ${delay}ms...`); // Log retry attempts
      await sleep(delay);
    }
  }

  throw lastError;
};

// Helper function to get the specific prompt based on the mode
const getPrompt = (mode, text) => {
  const prompts = {
    Summarizer: `Summarize the following text clearly. Format the output with:
- A brief overview paragraph.
- 3 to 5 key bullet points.

Text: ${text}`,

    Simplifier: `Explain the following concept like a 6th grader.
Limit response to 200 words.

Concept/Text: ${text}`,

    Roadmap: `Give me a roadmap for the following using the Pareto Principle.
Focus on the 20% of the knowledge/tasks that yields 80% of the results.

Topic/Text: ${text}`,

    Explainer: `As a teacher explaining to a high school audience, summarize the following content.
Use simple language and examples to make the key ideas accessible for students with no prior knowledge.

Content: ${text}`,

    Refiner: `You are a professional writer with a PhD in English. Your task is to refine the text below by
correcting grammatical errors and improving its flow, while maintaining the original style,
wording, and structure.

Text: ${text}`,

    Humanizer: `You are a skilled human editor. Rewrite the text below so it sounds natural, fluent, warm, and genuinely human-written.

Rules:
- Preserve the original meaning, intent, tone, and key details.
- Improve clarity, flow, rhythm, sentence variety, and readability.
- Remove robotic phrasing, stiff transitions, repeated patterns, and overly polished AI-style wording.
- Prefer simple, natural phrasing over formal, inflated, or dramatic language.
- Keep the writing clear and authentic.
- Do not add new facts, opinions, or examples unless needed for clarity.
- Do not explain your edits.
- Return only the rewritten text.
  
Text: ${text}`
  };

  return prompts[mode] || prompts["Summarizer"];
};

// Summarize route for AI text generation
app.post("/summarize", async (req, res) => {
  const { text, mode } = req.body;

  if (!text) {
    return res.status(400).json({ error: "No text provided" });
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompt = getPrompt(mode, text);

    const summary = await generateWithRetry(model, prompt, {
      retries: 3,
      baseDelayMs: 1000,
      maxDelayMs: 8000,
    });

    res.json({ summary });
  } catch (error) {
    logger.error("Gemini Error:", {
      message: error?.message,
      status: getStatusCode(error),
      code: error?.code,
      fullError: error,
    });

    const status = getStatusCode(error);

    if (status === 429) {
      return res.status(429).json({
        error: "Too many requests. Please try again in a moment.",
      });
    }

    if (typeof status === "number" && status >= 500) {
      return res.status(503).json({
        error: "AI service is temporarily unavailable. Please try again.",
      });
    }

    return res.status(500).json({
      error: "Failed to process request",
    });
  }
});

// const PORT = 5000;

const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    logger.info("Connected to MongoDB");


    job.start(); // Start the cron job after successful DB connection
    app.listen(PORT, () => {
      logger.info(`Backend running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    logger.error("MongoDB connection error:", error);
    process.exit(1);
  }); 
