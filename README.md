# AIChatWithYoutube
AIChatWithYoutube

Setup Instructions
1. Prerequisites
Ensure you have Node.js and npm installed.

2. Configure Environment Variables
Navigate to the server directory: cd server
Create a 
.env
 file (if it doesn't exist) and add the following keys:
GOOGLE_API_KEY: Your Google Generative AI API key.
YOUTUBE_API_KEY: Your YouTube Data API key.
DB_URL: Your PostgreSQL connection string (e.g., from Neon).
3. Start the Server
In the server directory:

Install dependencies: npm install

Start the server: npm start (after the proposed change) or node index.js.

The server will be listening at http://localhost:3000.
3. Start the Client
Open a NEW terminal.
Navigate to the client directory: cd client
Install dependencies: npm install
Start the development server: npm run dev
The client will be available at the URL provided by Vite (usually http://localhost:5173).