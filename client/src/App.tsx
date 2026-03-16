import { useState, useRef, useEffect } from 'react'
import ReactPlayer from 'react-player'
import { Send, Play, ArrowRight, MessageSquare, Video, Loader2 } from 'lucide-react'
import { sendChatMessage } from './lib/api'
import './App.css'

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp?: number
}

function App() {
  const [videoUrl, setVideoUrl] = useState('')
  const [activeUrl, setActiveUrl] = useState('')
  const [activeVideoId, setActiveVideoId] = useState('')
  const [isPlaying, setIsPlaying] = useState(false)
  const [input, setInput] = useState('')
  const [threadId] = useState(() => `thread_${Math.random().toString(36).substr(2, 9)}`)
  const [isLoading, setIsLoading] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hello! I can help you understand this video. Load a YouTube URL to get started.' }
  ])
  const playerRef = useRef<any>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleLoadVideo = () => {
    if (videoUrl) {
      // Extract video ID from URL
      let videoId = videoUrl;
      try {
        const url = new URL(videoUrl);
        if (url.hostname === 'youtu.be') {
          videoId = url.pathname.slice(1);
        } else {
          videoId = url.searchParams.get('v') || videoId;
        }
      } catch (e) {
        // Not a URL, use as is
      }
      
      setActiveUrl(`https://www.youtube.com/watch?v=${videoId}`)
      setActiveVideoId(videoId)
      setVideoUrl('') // Clear input
      setIsPlaying(true) // Start playing
      setMessages([{ role: 'assistant', content: `Video loaded (ID: ${videoId}). How can I help you today?` }])
    }
  }

  const handleSendMessage = async () => {
    if (!input.trim() || !activeVideoId || isLoading) return
    
    const prompt = input
    const userMsg: Message = { role: 'user', content: prompt }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsLoading(true)
    
    try {
      const data = await sendChatMessage(activeVideoId, prompt, threadId)
      const assistantMsg: Message = { 
        role: 'assistant', 
        content: data.answer,
        timestamp: data.timestamp
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch (error: any) {
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `Error: ${error.response?.data?.details || error.message || 'Failed to get answer from AI'}`
      }])
    } finally {
      setIsLoading(false)
    }
  }

  const jumpToTimestamp = (seconds: number) => {
    if (playerRef.current) {
      playerRef.current.seekTo(seconds, 'seconds')
    }
  }

  return (
    <div className="flex h-screen w-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">
      {/* Left Pane: Video Player */}
      <div className="flex-1 flex flex-col border-r border-slate-800 relative bg-black/20">
        <header className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center">
              <Video size={18} className="text-white" />
            </div>
            <h1 className="font-bold text-lg tracking-tight">AI Chat <span className="text-red-500 text-sm">PRO</span></h1>
          </div>
          <div className="flex gap-2 max-w-md w-full ml-auto">
            <input 
              className="bg-slate-800 border-none rounded-md px-3 py-1.5 text-sm w-full focus:ring-2 focus:ring-red-500 outline-none transition-all placeholder:text-slate-500"
              placeholder="Paste YouTube URL..." 
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
            />
            <button 
              onClick={handleLoadVideo}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-1.5 rounded-md text-sm font-medium transition-all active:scale-95 flex items-center gap-1 shadow-lg shadow-red-900/20"
            >
              <Play size={14} fill="currentColor" /> Load
            </button>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-8 bg-slate-950/40 relative">
          <div className="w-full max-w-5xl aspect-video rounded-2xl overflow-hidden bg-slate-900 shadow-2xl border border-slate-800/50 group relative">
            {activeUrl ? (
              // @ts-ignore
              <ReactPlayer 
                ref={playerRef}
                url={activeUrl} 
                width="100%" 
                height="100%" 
                controls 
                playing={isPlaying}
              />
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
      <div className="w-[480px] flex flex-col bg-slate-900/40 backdrop-blur-3xl border-l border-slate-800">
        <header className="p-4 border-b border-slate-800 flex items-center gap-2 bg-slate-900/60">
          <MessageSquare size={18} className="text-red-500" />
          <h2 className="font-semibold text-sm tracking-wide uppercase opacity-70">Video Insights</h2>
          <div className="ml-auto flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[10px] font-bold text-slate-500 uppercase">Agent Online</span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-none">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[90%] rounded-2xl p-4 shadow-xl border ${
                msg.role === 'user' 
                ? 'bg-red-600 text-white rounded-tr-none border-red-500' 
                : 'bg-slate-800/80 text-slate-100 rounded-tl-none border-slate-700/50'
              }`}>
                <p className="text-[14px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                {msg.timestamp !== undefined && (
                  <div className="mt-4 pt-4 border-t border-slate-700/50">
                    <button 
                      onClick={() => jumpToTimestamp(msg.timestamp!)}
                      className="flex items-center gap-2 bg-slate-950/80 hover:bg-slate-950 px-4 py-2 rounded-xl text-xs font-black text-red-500 border border-red-500/20 transition-all hover:scale-[1.02] active:scale-95 group w-full justify-center"
                    >
                      <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" /> 
                      JUMP TO {Math.floor(msg.timestamp / 60)}:{(msg.timestamp % 60).toString().padStart(2, '0')}
                    </button>
                    <p className="text-[10px] text-center mt-2 text-slate-500 opacity-60">Seek video to precisely this moment</p>
                  </div>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-slate-800/50 rounded-2xl rounded-tl-none p-4 flex items-center gap-3 border border-slate-700/30">
                <Loader2 size={16} className="animate-spin text-red-500" />
                <span className="text-sm text-slate-400 font-medium">Analyzing transcript...</span>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <footer className="p-4 border-t border-slate-800 bg-slate-900/60 backdrop-blur-md">
          <div className="relative group">
            <textarea 
              rows={2}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl px-5 py-4 text-sm pr-14 focus:ring-2 focus:ring-red-500/30 focus:border-red-500/50 outline-none resize-none transition-all placeholder:text-slate-600 shadow-inner"
              placeholder={activeVideoId ? "Ask a question about this video..." : "Load a video first..."}
              disabled={!activeVideoId || isLoading}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
            />
            <button 
              onClick={handleSendMessage}
              disabled={!input.trim() || !activeVideoId || isLoading}
              className="absolute right-3 bottom-3 p-2.5 bg-red-600 hover:bg-red-700 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl transition-all shadow-lg shadow-red-900/10 active:scale-95 disabled:scale-100"
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
