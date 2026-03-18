import React, { useState, useRef, useEffect } from 'react';
import { 
  Mic, 
  MicOff, 
  Send, 
  Stethoscope, 
  Heart, 
  ShieldAlert, 
  Trophy, 
  Volume2, 
  VolumeX,
  RefreshCw,
  User,
  Activity,
  MessageSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { getHealthcareAdvice, AdvisorMode, AIResponse } from './services/gemini';

interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
  emotion?: string;
  language?: string;
  timestamp: Date;
}

const ADVISOR_CONFIGS: Record<AdvisorMode, { icon: React.ReactNode; label: string; color: string; bg: string }> = {
  friend: { icon: <Heart className="w-5 h-5" />, label: 'Friend', color: 'text-rose-500', bg: 'bg-rose-50' },
  doctor: { icon: <Stethoscope className="w-5 h-5" />, label: 'Doctor', color: 'text-blue-500', bg: 'bg-blue-50' },
  parent: { icon: <ShieldAlert className="w-5 h-5" />, label: 'Parent', color: 'text-amber-500', bg: 'bg-amber-50' },
  coach: { icon: <Trophy className="w-5 h-5" />, label: 'Coach', color: 'text-emerald-500', bg: 'bg-emerald-50' },
};

export default function App() {
  const [mode, setMode] = useState<AdvisorMode>('doctor');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        setIsListening(false);
        handleSend(transcript);
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      setError(null);
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  const playAudio = (base64: string) => {
    if (isMuted) return;
    
    try {
      // The Gemini TTS model returns raw PCM data (16-bit, mono, 24000Hz).
      // We need to wrap it in a WAV header for the browser to play it.
      const binaryString = window.atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const wavHeader = new ArrayBuffer(44);
      const view = new DataView(wavHeader);

      // RIFF identifier 'RIFF'
      view.setUint32(0, 0x52494646, false);
      // file length
      view.setUint32(4, 36 + len, true);
      // RIFF type 'WAVE'
      view.setUint32(8, 0x57415645, false);
      // format chunk identifier 'fmt '
      view.setUint32(12, 0x666d7420, false);
      // format chunk length
      view.setUint32(16, 16, true);
      // sample format (raw PCM = 1)
      view.setUint16(20, 1, true);
      // channel count (mono = 1)
      view.setUint16(22, 1, true);
      // sample rate (24000Hz)
      view.setUint32(24, 24000, true);
      // byte rate (sample rate * block align)
      view.setUint32(28, 24000 * 2, true);
      // block align (channel count * bytes per sample)
      view.setUint16(32, 2, true);
      // bits per sample (16-bit)
      view.setUint16(34, 16, true);
      // data chunk identifier 'data'
      view.setUint32(36, 0x64617461, false);
      // data chunk length
      view.setUint32(40, len, true);

      const blob = new Blob([wavHeader, bytes], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      
      audio.onended = () => URL.revokeObjectURL(url);
      audio.onerror = (e) => console.error("Audio element error:", e);
      
      audio.play().catch(e => {
        console.error("Audio playback failed:", e);
        URL.revokeObjectURL(url);
      });
    } catch (err) {
      console.error("Error processing audio data:", err);
    }
  };

  const handleSend = async (textOverride?: string) => {
    const text = textOverride || input;
    if (!text.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      const response = await getHealthcareAdvice(text, mode, !isMuted);
      
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        content: response.text,
        emotion: response.emotion,
        language: response.language,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, aiMessage]);
      
      if (response.audioBase64) {
        playAudio(response.audioBase64);
      }
    } catch (err: any) {
      console.error(err);
      if (err.message === "QUOTA_EXCEEDED") {
        setError("Vitalis is currently experiencing high demand (API Quota Exceeded). Please wait a moment and try again.");
      } else {
        setError("Failed to get response from Vitalis. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight">Vitalis AI</h1>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Healthcare Companion</p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg">
          {(Object.keys(ADVISOR_CONFIGS) as AdvisorMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2",
                mode === m 
                  ? "bg-white text-slate-900 shadow-sm" 
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              {ADVISOR_CONFIGS[m].icon}
              <span className="hidden sm:inline">{ADVISOR_CONFIGS[m].label}</span>
            </button>
          ))}
        </div>

        <button 
          onClick={() => setIsMuted(!isMuted)}
          className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500"
        >
          {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
      </header>

      {/* Chat Area */}
      <main 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-6 max-w-4xl mx-auto w-full"
      >
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-6 py-12">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center text-blue-600"
            >
              <MessageSquare className="w-10 h-10" />
            </motion.div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-slate-800">How are you feeling today?</h2>
              <p className="text-slate-500 max-w-md">
                Describe your symptoms, ask for lifestyle advice, or just talk about your health. 
                Vitalis is here to listen and guide you.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
              {[
                "I have a persistent headache",
                "Suggest some healthy breakfast ideas",
                "I've been feeling very stressed lately",
                "What are the benefits of daily walking?"
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => handleSend(suggestion)}
                  className="p-4 bg-white border border-slate-200 rounded-xl text-left text-sm hover:border-blue-400 hover:shadow-md transition-all group"
                >
                  <p className="text-slate-600 group-hover:text-blue-600 font-medium">{suggestion}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "flex flex-col",
                msg.role === 'user' ? "items-end" : "items-start"
              )}
            >
              <div className={cn(
                "max-w-[85%] sm:max-w-[75%] rounded-2xl p-4 shadow-sm",
                msg.role === 'user' 
                  ? "bg-blue-600 text-white rounded-tr-none" 
                  : "bg-white border border-slate-200 rounded-tl-none"
              )}>
                {msg.role === 'ai' && (
                  <div className="flex items-center gap-2 mb-2">
                    <div className={cn("p-1 rounded-md", ADVISOR_CONFIGS[mode].bg, ADVISOR_CONFIGS[mode].color)}>
                      {ADVISOR_CONFIGS[mode].icon}
                    </div>
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Vitalis • {ADVISOR_CONFIGS[mode].label} Mode
                    </span>
                  </div>
                )}
                <p className="text-sm sm:text-base leading-relaxed whitespace-pre-wrap">
                  {msg.content}
                </p>
                {msg.role === 'ai' && (msg.emotion || msg.language) && (
                  <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-2">
                    {msg.emotion && (
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-bold uppercase rounded">
                        Emotion: {msg.emotion}
                      </span>
                    )}
                    {msg.language && (
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-bold uppercase rounded">
                        Language: {msg.language}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <span className="text-[10px] text-slate-400 mt-1 px-1">
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>

        {isLoading && (
          <div className="flex items-start gap-3">
            <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-none p-4 shadow-sm">
              <div className="flex gap-1">
                <motion.div 
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ repeat: Infinity, duration: 1 }}
                  className="w-1.5 h-1.5 bg-blue-400 rounded-full" 
                />
                <motion.div 
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ repeat: Infinity, duration: 1, delay: 0.2 }}
                  className="w-1.5 h-1.5 bg-blue-400 rounded-full" 
                />
                <motion.div 
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ repeat: Infinity, duration: 1, delay: 0.4 }}
                  className="w-1.5 h-1.5 bg-blue-400 rounded-full" 
                />
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-xl text-sm flex items-center gap-2">
            <ShieldAlert className="w-4 h-4" />
            {error}
          </div>
        )}
      </main>

      {/* Input Area */}
      <footer className="bg-white border-t border-slate-200 p-4 sm:p-6">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <button
            onClick={toggleListening}
            className={cn(
              "p-3 rounded-xl transition-all shadow-sm",
              isListening 
                ? "bg-red-500 text-white animate-pulse" 
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            )}
          >
            {isListening ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </button>
          
          <div className="flex-1 relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder={isListening ? "Listening..." : "Type your symptoms or questions..."}
              className="w-full bg-slate-100 border-none rounded-xl px-4 py-3 pr-12 focus:ring-2 focus:ring-blue-500 transition-all text-slate-800 placeholder:text-slate-400"
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || isLoading}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-blue-600 disabled:text-slate-300 transition-colors"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
        <p className="text-[10px] text-center text-slate-400 mt-4 uppercase tracking-widest font-medium">
          Educational purposes only • Not a medical diagnosis
        </p>
      </footer>
    </div>
  );
}
