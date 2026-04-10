import { useState, useRef, useEffect } from 'react'
import ReactPlayer from 'react-player'
import { Send, Play, MessageSquare, Video, Loader2 } from 'lucide-react'
import { sendChatMessage } from './lib/api'
import './App.css'

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp?: number
  suggestions?: string[]
  id?: string
}

function App() {
  const [videoUrl, setVideoUrl] = useState('')
  const [activeUrl, setActiveUrl] = useState('')
  const [activeVideoId, setActiveVideoId] = useState('')
  const [isPlaying, setIsPlaying] = useState(false)
  const [input, setInput] = useState('')
  const [threadId, setThreadId] = useState(() => `thread_${Math.random().toString(36).substr(2, 9)}`)
  const [isLoading, setIsLoading] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hello! I can help you understand this video. Load a YouTube URL to get started.' }
  ])
  // playerRef MUST be passed as a direct JSX prop, not inside a spread object
  // React silently ignores ref when it appears in a spread: {...({ ref: x } as any)}
  const playerRef = useRef<any>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleLoadVideo = () => {
    if (videoUrl) {
      console.log("Attempting to load URL:", videoUrl);
      // Improved extraction logic for various YouTube URL formats
      const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/;
      const match = videoUrl.match(regExp);
      const videoId = (match && match[2].length === 11) ? match[2] : null;

      if (videoId) {
        const fullUrl = `https://www.youtube.com/watch?v=${videoId}`;
        console.log("Extracted Video ID:", videoId, "Full URL:", fullUrl);
        setActiveUrl(fullUrl)
        setActiveVideoId(videoId)
        setThreadId(`thread_${Math.random().toString(36).substr(2, 9)}`)
        setMessages([{ role: 'assistant', content: `Video loaded (ID: ${videoId}). How can I help you today?` }])
      } else {
        console.warn("Could not extract Video ID. Falling back to raw URL:", videoUrl);
        // Fallback for non-standard but valid URLs
        setActiveUrl(videoUrl)
        setActiveVideoId(videoUrl)
        setMessages([{ role: 'assistant', content: `Loading custom URL. Note: AI features work best with standard YouTube IDs.` }])
      }

      setVideoUrl('') // Clear input
      setIsPlaying(true) // Start playing
    }
  }


  const sendMessage = async (text: string) => {
    if (!text.trim() || !activeVideoId || isLoading) return

    const userMsg: Message = { role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsLoading(true)

    try {
      const data = await sendChatMessage(activeVideoId, text, threadId)
      const assistantMsg: Message = {
        role: 'assistant',
        content: data.answer,
        timestamp: data.timestamp,
        suggestions: data.suggestions ?? []
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch (error: any) {
      const errorMsg = error.response?.data?.details || error.response?.data?.error || error.message || 'Failed to get answer from AI';
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `⚠️ ${errorMsg}`
      }])
    } finally {
      setIsLoading(false)
    }
  }

  const handleSendMessage = () => sendMessage(input)

  const jumpToTimestamp = (seconds: number) => {
    const player = playerRef.current;
    console.log("JUMP REQUESTED:", seconds, "playerRef.current:", player);
    if (!player) {
      console.error("No player ref. Make sure ref={playerRef} is a direct JSX prop.");
      return;
    }
    // react-player v3: the ref exposes an HTMLMediaElement-compatible interface
    // For YouTube, currentTime is a setter that calls the YouTube player's seekTo internally
    try {
      player.currentTime = seconds;
      if (player.paused) {
        player.play?.().catch((e: any) => console.warn("play() failed:", e));
      }
    } catch (err) {
      console.error("Seek failed:", err);
    }
  }

  const renderMessageContent = (content: string) => {
    // Regex for [Timestamp: HH:MM:SS, MM:SS, ...]
    const parts = content.split(/(\[Timestamp:\s*[^\]]+\])/gi);
    let foundFirst = false;

    return parts.map((part, i) => {
      const tagMatch = part.match(/\[Timestamp:\s*([^\]]+)\]/i);

      if (tagMatch && !foundFirst) {
        foundFirst = true;
        // Only parse the very first time string if multiple exist in the tag
        const firstTimeStr = tagMatch[1].split(',')[0].trim();
        const match = firstTimeStr.match(/(?:(\d+):)?(\d+):(\d+)/);

        if (match) {
          const h = match[1] ? parseInt(match[1]) : 0;
          const m = parseInt(match[2]);
          const s = parseInt(match[3]);
          const totalSeconds = h * 3600 + m * 60 + s;
          const displayTime = `${match[1] ? match[1] + ':' : ''}${match[2]}:${match[3]}`;

          return (
            <button
              key={i}
              onClick={() => jumpToTimestamp(totalSeconds)}
              className="inline-flex items-center gap-1 mx-1 px-2 py-0.5 rounded-md bg-violet-500/20 hover:bg-violet-500/40 text-violet-400 font-bold text-xs transition-colors border border-violet-500/30"
            >
              <Play size={10} fill="currentColor" />
              {displayTime}
            </button>
          );
        }
      }
      // Return as plain text for subsequent tags or malformed matches
      return <span key={i}>{part}</span>;
    });
  }

  return (
    <div className="flex h-screen w-screen text-slate-100 font-sans overflow-hidden" style={{ background: '#0d0a1e' }}>
      {/* Left Pane: Video Player */}
      <div className="flex-1 flex flex-col border-r border-purple-900/50 relative" style={{ background: 'rgba(20,10,40,0.6)' }}>
        <header className="p-4 border-b border-purple-900/50 flex items-center justify-between backdrop-blur-md" style={{ background: 'rgba(20,10,50,0.7)' }}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center shadow-lg shadow-violet-900/40">
              <Video size={18} className="text-white" />
            </div>
            <h1 className="font-bold text-lg tracking-tight">AI Chat <span className="text-violet-400 text-sm">PRO</span></h1>
          </div>
          <div className="flex gap-2 max-w-md w-full ml-auto">
            <input
              className="border border-purple-800/50 rounded-md px-3 py-1.5 text-sm w-full focus:ring-2 focus:ring-violet-500 outline-none transition-all placeholder:text-slate-500"
              style={{ background: 'rgba(60,30,100,0.4)' }}
              placeholder="Paste YouTube URL..."
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
            />
            <button
              onClick={handleLoadVideo}
              className="bg-violet-600 hover:bg-violet-700 text-white px-4 py-1.5 rounded-md text-sm font-medium transition-all active:scale-95 flex items-center gap-1 shadow-lg shadow-violet-900/30"
            >
              <Play size={14} fill="currentColor" /> Load
            </button>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-8 relative" style={{ background: 'rgba(13,10,30,0.3)' }}>
          <div className="w-full max-w-5xl aspect-video rounded-2xl overflow-hidden shadow-2xl border border-purple-900/40 relative z-0" style={{ background: 'rgba(20,10,40,0.8)' }}>
            {isMounted && activeUrl ? (
              <div className="w-full h-full relative z-10 pointer-events-auto">
                {/* ref MUST be a direct prop — it is silently dropped when spread */}
                <ReactPlayer
                  ref={playerRef as any}
                  {...({
                    src: activeUrl,
                    width: "100%",
                    height: "100%",
                    controls: true,
                    playing: isPlaying,
                    onPlay: () => setIsPlaying(true),
                    onPause: () => setIsPlaying(false),
                    onReady: () => console.log("ReactPlayer ready. ref set:", !!playerRef.current),
                    onError: (e: any) => console.error("ReactPlayer Error:", e),
                    config: {
                      youtube: {
                        playerVars: {
                          autoplay: 1,
                          controls: 1,
                          modestbranding: 1,
                          rel: 0,
                        }
                      }
                    }
                  } as any)}
                />
              </div>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 gap-4">
                <div className="relative">
                  <Video size={64} className="opacity-10" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Play size={32} className="opacity-20 translate-x-1" />
                  </div>
                </div>
                <p className="text-lg font-medium opacity-30 tracking-tight">Enter a YouTube video URL to begin analysis</p>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Right Pane: Chat Interface */}
      <div className="w-[480px] flex flex-col backdrop-blur-3xl border-l border-purple-900/50" style={{ background: 'rgba(18,10,45,0.7)' }}>
        <header className="p-4 border-b border-purple-900/50 flex items-center gap-2" style={{ background: 'rgba(22,12,55,0.8)' }}>
          <MessageSquare size={18} className="text-violet-400" />
          <h2 className="font-semibold text-sm tracking-wide uppercase opacity-70">Video Insights</h2>
          <div className="ml-auto flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[10px] font-bold text-slate-500 uppercase">Agent Online</span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-none">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[90%] rounded-2xl p-4 shadow-xl border ${msg.role === 'user'
                ? 'bg-violet-600 text-white rounded-tr-none border-violet-500'
                : 'text-slate-100 rounded-tl-none border-purple-800/40'
                }`}
                style={msg.role === 'assistant' ? { background: 'rgba(50,25,90,0.6)' } : {}}
              >
                <div className="text-[14px] leading-relaxed whitespace-pre-wrap">
                  {msg.role === 'assistant' ? renderMessageContent(msg.content) : msg.content}
                </div>
                {msg.role === 'assistant' && msg.suggestions && msg.suggestions.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-purple-800/30 flex flex-col gap-1.5">
                    {msg.suggestions.map((q, qi) => (
                      <button
                        key={qi}
                        onClick={() => sendMessage(q)}
                        className="text-left text-xs px-3 py-2 rounded-lg border border-violet-500/30 bg-violet-500/10 hover:bg-violet-500/25 text-violet-300 transition-all hover:border-violet-400/50 leading-snug"
                      >
                        💬 {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-tl-none p-4 flex items-center gap-3 border border-purple-800/30" style={{ background: 'rgba(50,25,90,0.4)' }}>
                <Loader2 size={16} className="animate-spin text-violet-400" />
                <span className="text-sm text-slate-400 font-medium">Analyzing transcript...</span>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <footer className="p-4 border-t border-purple-900/50 backdrop-blur-md" style={{ background: 'rgba(22,12,55,0.8)' }}>
          <div className="relative group">
            <textarea
              rows={2}
              className="w-full border rounded-2xl px-5 py-4 text-sm pr-14 focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500/60 outline-none resize-none transition-all placeholder:text-slate-600 shadow-inner"
              style={{ background: 'rgba(40,20,80,0.5)', borderColor: 'rgba(109,40,217,0.4)' }}
              placeholder={activeVideoId ? "Ask a question about this video..." : "Load a video first..."}
              disabled={!activeVideoId || isLoading}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
            />
            <button
              onClick={handleSendMessage}
              disabled={!input.trim() || !activeVideoId || isLoading}
              className="absolute right-3 bottom-3 p-2.5 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl transition-all shadow-lg shadow-violet-900/20 active:scale-95 disabled:scale-100"
            >
              <Send size={18} />
            </button>
          </div>
          <p className="text-[10px] text-slate-500 mt-3 text-center uppercase tracking-[0.2em] font-black opacity-30">Gemini Neural Processor</p>
        </footer>
      </div>
    </div>
  )
}

export default App
