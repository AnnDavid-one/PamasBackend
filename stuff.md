    ? "https://pamasbackend-qhu8.onrender.com/auth/google/callback",

    FRONTEND_URL=http://localhost:3000,https://pamas-omega.vercel.app



    1. On your Local Computer (.env file)
When working offline, everything points strictly to your local ports:

Code snippet
FRONTEND_URL=http://localhost:3000
GOOGLE_CALLBACK_URL=http://localhost:5000/auth/google/callback
2. On Render (Dashboard Environment Variables)
When live in production, everything points strictly to your cloud services:

Code snippet
FRONTEND_URL=https://pamas-omega.vercel.app
GOOGLE_CALLBACK_URL=https://pamasbackend-qhu8.onrender.com/auth/google/callback
