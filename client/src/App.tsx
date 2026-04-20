import React, { useState, useRef, useEffect } from 'react'
import ReactPlayer from 'react-player'
import { Send, Play, MessageSquare, Video, Loader2, Search, Info, List, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { sendChatMessage, fetchVideoMetadata } from './lib/api'
import './App.css'

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp?: number
  suggestions?: string[]
  id?: string
}

// Memoized player component to prevent inline props from triggering re-renders that reset player state (like volume)
const MemoizedPlayer = React.memo(({ activeUrl, playerRef }: any) => {
  return (
    <ReactPlayer
      ref={playerRef}
      src={activeUrl}
      width="100%"
      height="100%"
      controls={true}
      config={{
        youtube: {
          playerVars: { autoplay: 1, controls: 1, modestbranding: 1, rel: 0 }
        }
      }}
    />
  );
}, (prevProps, nextProps) => {
  return prevProps.activeUrl === nextProps.activeUrl;
});

function App() {
  const [videoUrl, setVideoUrl] = useState('')
  const [activeUrl, setActiveUrl] = useState('')
  const [activeVideoId, setActiveVideoId] = useState('')
  const [input, setInput] = useState('')
  const [threadId, setThreadId] = useState(() => `thread_${Math.random().toString(36).substr(2, 9)}`)
  const [isLoading, setIsLoading] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hello! I can help you understand this video. Load a YouTube URL to get started.' }
  ])
  // playerRef MUST be passed as a direct JSX prop, not inside a spread object
  // React silently ignores ref when it appears in a spread: {...({ ref: x } as any)}
  const [metadata, setMetadata] = useState<{title?: string, description?: string, chapters?: any[], thumbnail?: string} | null>(null)
  const [activeTab, setActiveTab] = useState<'timeline' | 'description'>('timeline')
  const [isDescExpanded, setIsDescExpanded] = useState(false)
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
      
      // Robust regex for various YouTube formats (standard, shortened, shorts, embed)
      const regExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([^"&?\/\s]{11})/;
      const match = videoUrl.match(regExp);
      const videoId = match ? match[1] : null;

      if (videoId) {
        const fullUrl = `https://www.youtube.com/watch?v=${videoId}`;
        console.log("Extracted Video ID:", videoId);
        setActiveUrl(fullUrl);
        setActiveVideoId(videoId);
        
        const newThreadId = `thread_${Math.random().toString(36).substr(2, 9)}`;
        setThreadId(newThreadId);
        setMessages([{ role: 'assistant', content: `Video loaded. Generating summary...` }]);
        
        // Trigger auto-summary and metadata fetch
        setTimeout(() => {
          sendMessage("Provide a concise summary of this video in approximately 100 words. Focus on the main topics and key takeaways.", videoId, newThreadId, true);
          loadMetadata(videoId);
        }, 100);
      } else {
        // Fallback for non-standard URLs
        console.warn("Could not extract 11-char Video ID. Using raw input.");
        setActiveUrl(videoUrl);
        setActiveVideoId(videoUrl);
        setMessages([{ role: 'assistant', content: `Loading URL. AI features might be limited for non-standard YouTube links.` }]);
      }

      setVideoUrl('')
    }
  }

  const loadMetadata = async (videoId: string) => {
    console.log("[METADATA] Loading metadata for:", videoId);
    try {
      const data = await fetchVideoMetadata(videoId);
      console.log("[METADATA] Received data:", data);
      setMetadata(data);
      if (data.chapters && data.chapters.length > 0) {
        setActiveTab('timeline');
      } else {
        setActiveTab('description');
      }
    } catch (err: any) {
      console.error("[METADATA] Failed to load metadata:", err.message, err.response?.data);
    }
  }


  const sendMessage = async (text: string, overrideVideoId?: string, overrideThreadId?: string, isHidden: boolean = false) => {
    const vId = overrideVideoId || activeVideoId;
    const tId = overrideThreadId || threadId;

    if (!text.trim() || !vId || isLoading) return

    if (!isHidden) {
      const userMsg: Message = { role: 'user', content: text }
      setMessages(prev => [...prev, userMsg])
    }
    
    setInput('')
    setIsLoading(true)

    try {
      const data = await sendChatMessage(vId, text, tId)
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
    if (!player) return;

    try {
      if (typeof player.seekTo === 'function') {
        player.seekTo(seconds, 'seconds');
        const internalPlayer = player.getInternalPlayer();
        if (internalPlayer && typeof internalPlayer.playVideo === 'function') {
          internalPlayer.playVideo();
        }
      } else {
        player.currentTime = seconds;
        if (player.paused) {
          player.play?.().catch((e: any) => console.warn("play() failed:", e));
        }
      }
    } catch (err) {
      console.error("Seek failed:", err);
    }
  }

  const renderMessageContent = (content: string) => {
    // 1. First split by bold markers **text**
    const boldParts = content.split(/(\*\*[^*]+\*\*)/g);

    return boldParts.map((boldPart, bi) => {
      // If it's a bold segment
      if (boldPart.startsWith('**') && boldPart.endsWith('**')) {
        return <strong key={`b-${bi}`} className="text-violet-300">{boldPart.slice(2, -2)}</strong>;
      }

      // 2. Then process timestamps in the non-bold segments
      const parts = boldPart.split(/(\[Timestamp:\s*[^\]]+\])/gi);

      return parts.map((part, i) => {
        const tagMatch = part.match(/\[Timestamp:\s*([^\]]+)\]/i);

        if (tagMatch) {
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
                key={`${bi}-${i}`}
                onClick={() => jumpToTimestamp(totalSeconds)}
                className="inline-flex items-center gap-1 mx-1 px-2 py-0.5 rounded-md bg-violet-500/20 hover:bg-violet-500/40 text-violet-400 font-bold text-xs transition-colors border border-violet-500/30"
              >
                <Play size={10} fill="currentColor" />
                {displayTime}
              </button>
            );
          }
        }
        return <span key={`${bi}-${i}`}>{part}</span>;
      });
    });
  }

// New helper to render interactive paragraphs for chat or description
function renderInteractiveParagraphs(content: string, isDescription: boolean = false) {
  // Normalize bullet points to ensure they have a newline before them if they follow content
  const normalized = content.replace(/([^\n])\n([*•-])/g, '$1\n\n$2');
  const paragraphs = normalized.split(/\n\n/).filter(p => p.trim().length > 0);
  
  return paragraphs.map((para, i) => {
    // Clean search text for AI prompt
    const cleanSearchText = para.replace(/^[\s*•-]+/, '').trim();
    
    return (
      <div
        key={i}
        title={isDescription ? "Click to ask AI about this point" : "Click to fact-check this claim"}
        className={`cursor-pointer hover:bg-white/10 rounded-lg p-2 transition-all flex items-start group/para relative mb-2 ${isDescription ? 'hover:bg-violet-500/5' : ''}`}
        onClick={() => sendMessage(isDescription ? `Tell me more about this: ${cleanSearchText}` : `Fact-check this: ${cleanSearchText}`, undefined, undefined, true)}
      >
        <Search size={14} className={`mr-2 mt-1 flex-shrink-0 text-violet-400 transition-opacity ${isDescription ? 'opacity-20 group-hover/para:opacity-100' : 'opacity-40 group-hover/para:opacity-100'}`} />
        <div className="flex-1">
          {renderMessageContent(para.trim())}
        </div>
      </div>
    );
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

        <main className="flex-1 overflow-y-auto p-6 space-y-8" style={{ background: 'rgba(13,10,30,0.3)' }}>
          {/* Video Player Display */}
          <div className="w-full max-w-5xl mx-auto aspect-video rounded-2xl overflow-hidden shadow-2xl border border-purple-900/40 relative z-0" style={{ background: 'rgba(20,10,40,0.8)' }}>
            {isMounted && activeUrl ? (
              <div className="w-full h-full relative z-10 pointer-events-auto">
                <MemoizedPlayer
                  playerRef={playerRef}
                  activeUrl={activeUrl}
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

          {/* Video Information & Timeline Section */}
          {metadata && (
            <div className="w-full max-w-5xl mx-auto rounded-2xl border border-purple-900/30 overflow-hidden backdrop-blur-md" style={{ background: 'rgba(20,10,50,0.4)' }}>
              <div className="flex border-b border-purple-900/30 px-4 bg-purple-950/20">
                <button
                  onClick={() => setActiveTab('timeline')}
                  className={`flex items-center gap-2 px-6 py-3 text-xs font-bold uppercase tracking-widest transition-all border-b-2 ${activeTab === 'timeline' ? 'border-violet-500 text-violet-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
                >
                  <List size={14} /> Timeline
                </button>
                <button
                  onClick={() => setActiveTab('description')}
                  className={`flex items-center gap-2 px-6 py-3 text-xs font-bold uppercase tracking-widest transition-all border-b-2 ${activeTab === 'description' ? 'border-violet-500 text-violet-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
                >
                  <Info size={14} /> Description
                </button>
              </div>

              <div className="p-6">
                {activeTab === 'timeline' ? (
                  <div className="space-y-3">
                    {metadata.chapters && metadata.chapters.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {metadata.chapters.map((chapter, idx) => (
                          <div key={idx} className="flex items-center gap-2 group">
                            <button
                              onClick={() => jumpToTimestamp(chapter.seconds)}
                              className="flex-1 flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-violet-600/20 border border-white/5 hover:border-violet-500/30 transition-all text-left"
                            >
                              <span className="flex-shrink-0 w-12 text-[10px] font-black text-violet-400 bg-violet-400/10 py-1 rounded text-center group-hover:bg-violet-500 group-hover:text-white transition-colors">
                                {chapter.time}
                              </span>
                              <span className="text-sm font-medium text-slate-300 group-hover:text-white truncate">
                                {chapter.title}
                              </span>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                sendMessage(`Explain the context and key points of the video section titled "${chapter.title}" starting at ${chapter.time}.`);
                              }}
                              title="Ask AI about this section"
                              className="p-3 rounded-xl bg-white/5 hover:bg-violet-600/20 border border-white/5 hover:border-violet-500/30 transition-all text-violet-400 opacity-0 group-hover:opacity-100"
                            >
                              <MessageSquare size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-slate-500">
                        <Clock size={32} className="mx-auto mb-2 opacity-20" />
                        <p className="text-sm">No chapters found in this video's description.</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="relative">
                    <div 
                      className={`text-sm leading-relaxed text-slate-400 transition-all duration-500 custom-scrollbar ${isDescExpanded ? 'max-h-96 overflow-y-auto pr-2' : 'max-h-48 overflow-hidden'}`}
                      style={{ whiteSpace: 'pre-wrap' }}
                    >
                      {renderInteractiveParagraphs(metadata.description || '', true)}
                    </div>
                    {!isDescExpanded && metadata.description && metadata.description.length > 300 && (
                      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#140a32] to-transparent pointer-events-none" />
                    )}
                    {metadata.description && metadata.description.length > 300 && (
                      <button
                        onClick={() => setIsDescExpanded(!isDescExpanded)}
                        className="mt-4 flex items-center gap-1.5 text-xs font-bold text-violet-400 hover:text-violet-300 transition-colors uppercase tracking-wider"
                      >
                        {isDescExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        {isDescExpanded ? 'Show Less' : 'Show Full Description'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
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
          {messages.map((msg, i) => {
            const isFactCheck = msg.role === 'assistant' && msg.content.includes('Fact-Check Result:');
            
            return (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[90%] rounded-2xl p-4 shadow-xl border ${msg.role === 'user'
                  ? 'bg-violet-600 text-white rounded-tr-none border-violet-500'
                  : isFactCheck 
                    ? 'border-emerald-500/40 rounded-tl-none' 
                    : 'text-slate-100 rounded-tl-none border-purple-800/40'
                  }`}
                  style={msg.role === 'assistant' ? { 
                    background: isFactCheck ? 'rgba(6, 78, 59, 0.3)' : 'rgba(50,25,90,0.6)',
                    backdropFilter: 'blur(10px)'
                  } : {}}
                >
                <div className="text-[14px] leading-relaxed whitespace-pre-wrap">
                  {msg.role === 'assistant' ? renderInteractiveParagraphs(msg.content) : msg.content}
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
            );
          })}
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
