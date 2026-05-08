# AIChatWithYoutube 🎥🤖

AIChatWithYoutube is a full-stack web application that allows users to interactively chat with an AI about any YouTube video. By simply providing a YouTube URL, the application fetches the video's transcript, processes it using advanced LLMs and a direct RAG (Retrieval-Augmented Generation) pipeline, and enables users to ask questions, summarize content, and fact-check information in real-time.

## 🌟 Features

- **Interactive AI Chat:** Have contextual conversations about the content of a YouTube video with sub-15-second response times.
- **RAG Pipeline & Embeddings:** Efficiently retrieves relevant segments of the video transcript using vector search.
- **Fact-Checking:** Built-in capability to cross-reference AI responses with external sources like Wikipedia.
- **Dynamic Video Player:** Integrated YouTube player that syncs with the conversation and maintains user settings across re-renders.
- **Interactive Metadata:** Scrollable, interactive video descriptions with clickable timestamps and AI-powered fact-checking.
- **Timeline & Chapters:** Extracts and displays video chapters conditionally, allowing users to ask the AI specific questions about individual sections.
- **Modern UI/UX:** A responsive, beautiful interface built with React, TailwindCSS, and Framer Motion.

## 🛠️ Tech Stack

### Frontend (Client)
- **Framework:** React 19 with Vite & TypeScript
- **Styling:** TailwindCSS v4, Framer Motion (Animations)
- **Data Fetching:** TanStack React Query, Axios
- **Components:** React Player, Lucide React (Icons)

### Backend (Server)
- **Runtime:** Node.js, Express
- **AI & Agents:** LangChain, LangGraph, Google Generative AI (`gemini-3.1-flash-lite-preview` & `gemini-embedding-2-preview`)
- **Database (Vector Store):** Neon Serverless Postgres (`@neondatabase/serverless`) for storing and querying video embeddings.
- **Utilities:** `youtube-transcript-plus` (Transcript fetching), Zod (Validation)

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- npm or yarn
- A PostgreSQL database (e.g., [Neon](https://neon.tech/)) with pgvector extension.
- Google Generative AI API Key
- YouTube Data API Key

### 1. Clone the Repository
```bash
git clone <repository-url>
cd AIChatWithYoutube
```

### 2. Server Setup
Navigate to the server directory:
```bash
cd server
```

Install dependencies:
```bash
npm install
```

Create a `.env` file in the `server` directory and configure the following variables:
```env
# API Keys
GOOGLE_API_KEY2=your_google_api_key  # Used for Gemini LLM and Embeddings
YOUTUBE_API_KEY=your_youtube_api_key # Used for fetching video metadata

# Database Configuration
DB_URL=your_postgres_connection_string # e.g., Neon connection string
```

Start the backend server:
```bash
npm start
# Server will run on http://localhost:3000
```

### 3. Client Setup
Open a new terminal and navigate to the client directory:
```bash
cd client
```

Install dependencies:
```bash
npm install
```

Start the frontend development server:
```bash
npm run dev
# Client will be available at http://localhost:5173
```

## 🤝 Contributing
Contributions, issues, and feature requests are welcome!

## 📝 License
This project is licensed under the ISC License.