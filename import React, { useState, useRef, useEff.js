import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, User, Loader2, Plus, MessageSquare, Menu, X, Settings, ChevronDown, Zap, Brain, Flame, Lock, Mail, ArrowRight, Image as ImageIcon, Copy, Check, Terminal } from 'lucide-react';

// Firebase Imports
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot } from 'firebase/firestore';

// --- Firebase Initialization ---
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- Custom Icons ---
const LemonIcon = ({ size = 24, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M6 18c-2.3-2.3-3.1-6.2-1.8-9 1.4-2.8 4.7-4.1 7.8-4.1 3.1 0 6.4 1.3 7.8 4.1 1.3 2.8.5 6.7-1.8 9-2.3 2.3-6.2 2.3-12 0z" />
  </svg>
);

// --- Code Block Component ---
const CodeBlock = ({ code, language }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const textArea = document.createElement("textarea");
    textArea.value = code;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Fallback copy failed', err);
    }
    document.body.removeChild(textArea);
  };

  return (
    <div className="my-4 rounded-xl overflow-hidden border border-stone-200 shadow-sm">
      <div className="bg-stone-800 px-4 py-2 flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <Terminal size={14} className="text-amber-400" />
          <span className="text-xs font-mono text-stone-300 uppercase tracking-wider">{language || 'script'}</span>
        </div>
        <button 
          onClick={handleCopy}
          className="text-stone-400 hover:text-white transition-colors flex items-center space-x-1 text-xs"
        >
          {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
          <span>{copied ? 'Copied!' : 'Copy'}</span>
        </button>
      </div>
      <div className="bg-stone-900 p-4 overflow-x-auto">
        <pre className="text-sm font-mono text-amber-50/90 leading-relaxed whitespace-pre">
          {code}
        </pre>
      </div>
    </div>
  );
};

// --- Message Parser Component ---
const MessageContent = ({ text }) => {
  if (!text) return null;

  // Split by code blocks
  const parts = text.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-1">
      {parts.map((part, index) => {
        if (part.startsWith('```')) {
          const match = part.match(/```(\w+)?\n?([\s\S]*?)```/);
          if (match) {
            const language = match[1] || '';
            const code = match[2].trim();
            return <CodeBlock key={index} code={code} language={language} />;
          }
        }
        
        // Handle regular text with line breaks and simple bolding
        return (
          <div key={index} className="whitespace-pre-wrap">
            {part.split('\n').map((line, i) => (
              <p key={i} className={line.trim() === '' ? 'h-2' : ''}>
                {line.split(/(\*\*.*?\*\*)/g).map((subPart, j) => {
                  if (subPart.startsWith('**') && subPart.endsWith('**')) {
                    return <strong key={j} className="font-bold text-stone-900">{subPart.slice(2, -2)}</strong>;
                  }
                  return subPart;
                })}
              </p>
            ))}
          </div>
        );
      })}
    </div>
  );
};

export default function App() {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoginView, setIsLoginView] = useState(true);
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const defaultPrompt = "You are LUMEN, a bright, cheerful, and highly intelligent AI. Your current interface has a fresh, muted 'Amber' theme. Your responses should be helpful, concise, slightly witty, and have a warm tone. You excel at generating code, scripts, and creative ideas.";
  const [systemPrompt, setSystemPrompt] = useState(defaultPrompt);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [tempPrompt, setTempPrompt] = useState(systemPrompt);
  const [activeMode, setActiveMode] = useState('little');
  const [isModeMenuOpen, setIsModeMenuOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('Squeezing some ideas...');
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);

  const activeChat = chats.find(c => c.id === activeChatId) || { messages: [], title: 'Loading...' };

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth error:", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setFirebaseUser);
    return () => unsubscribe();
  }, []);

  const serializeMessages = (msgs) => {
    return JSON.stringify(msgs.map(m => ({
      role: m.role,
      text: m.text,
      image: m.image ? "[IMAGE_PLACEHOLDER]" : undefined
    })));
  };

  useEffect(() => {
    if (!firebaseUser) return;
    const chatsRef = collection(db, 'artifacts', appId, 'users', firebaseUser.uid, 'chats');
    const unsubscribe = onSnapshot(chatsRef, (snapshot) => {
      const loadedChats = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        let parsedMessages = [];
        try {
          parsedMessages = data.messagesJson ? JSON.parse(data.messagesJson) : (data.messages || []);
        } catch (e) { console.error("Parse fail:", e); }
        loadedChats.push({ id: doc.id, title: data.title || 'New Chat', createdAt: data.createdAt || 0, messages: parsedMessages });
      });
      loadedChats.sort((a, b) => b.createdAt - a.createdAt);
      setChats(prev => loadedChats.map(lc => {
        const pc = prev.find(p => p.id === lc.id);
        if (pc) {
          lc.messages = lc.messages.map((m, i) => (m.image === "[IMAGE_PLACEHOLDER]" && pc.messages[i]?.image?.startsWith('data:image')) ? { ...m, image: pc.messages[i].image } : m);
        }
        return lc;
      }));
      setActiveChatId(curr => !curr && loadedChats.length > 0 ? loadedChats[0].id : curr);
      if (loadedChats.length === 0) createNewChatInDB(firebaseUser.uid);
    });
    return () => unsubscribe();
  }, [firebaseUser]);

  const createNewChatInDB = async (uid) => {
    const newId = Date.now().toString();
    const initial = [{ role: 'model', text: 'Initialization complete. I am LUMEN. How can I brighten your day?' }];
    await setDoc(doc(db, 'artifacts', appId, 'users', uid, 'chats', newId), {
      title: 'New Chat', messagesJson: serializeMessages(initial), createdAt: Date.now()
    });
    setActiveChatId(newId);
  };

  const handleNewChat = () => {
    if (firebaseUser) createNewChatInDB(firebaseUser.uid);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const switchChat = (id) => {
    setActiveChatId(id);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [activeChat?.messages, isLoading]);

  const fetchWithRetry = async (url, options, retries = 5) => {
    const delays = [1000, 2000, 4000, 8000, 16000];
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(url, options);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (err) {
        if (i === retries - 1) throw err;
        await new Promise(r => setTimeout(r, delays[i]));
      }
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !firebaseUser || !activeChatId) return;

    const userText = input.trim();
    const newUserMsg = { role: 'user', text: userText };
    const updatedMsgs = [...activeChat.messages, newUserMsg];
    const newTitle = activeChat.messages.length <= 1 ? userText.slice(0, 24) + '...' : activeChat.title;

    setChats(prev => prev.map(c => c.id === activeChatId ? { ...c, title: newTitle, messages: updatedMsgs } : c));
    const chatRef = doc(db, 'artifacts', appId, 'users', firebaseUser.uid, 'chats', activeChatId);
    await setDoc(chatRef, { title: newTitle, messagesJson: serializeMessages(updatedMsgs) }, { merge: true });
    
    setInput('');
    setIsLoading(true);
    setLoadingText('Squeezing some ideas...');
    setError(null);

    try {
      const apiKey = "";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
      
      const modeInstr = {
        little: "Fast and concise.",
        big: "Detailed and structured.",
        spicy: "Deep expert reasoning."
      };

      const imgInstr = "You have an image generator. To use it, include <IMAGE_PROMPT>description</IMAGE_PROMPT>. ONLY draw what is currently requested. Do NOT combine old topics with new requests unless explicitly asked. If you write code, always wrap it in triple backticks with the language name.";

      const payload = {
        contents: updatedMsgs.filter(m => !m.image).map(m => ({ role: m.role, parts: [{ text: m.text }] })),
        systemInstruction: { parts: [{ text: `${systemPrompt}\n\n${imgInstr}\n\nMODE: ${modeInstr[activeMode]}` }] }
      };

      const result = await fetchWithRetry(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      let aiText = result.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't process that.";
      let base64 = null;

      const imgMatch = aiText.match(/<IMAGE_PROMPT>([\s\S]*?)<\/IMAGE_PROMPT>/i);
      if (imgMatch) {
        setLoadingText('Painting masterpiece...');
        const prompt = imgMatch[1].trim();
        aiText = aiText.replace(/<IMAGE_PROMPT>[\s\S]*?<\/IMAGE_PROMPT>/i, '').trim() || "Painting that for you now!";
        
        const imgRes = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ instances: { prompt }, parameters: { sampleCount: 1 } })
        });
        base64 = imgRes.predictions?.[0]?.bytesBase64Encoded;
      }

      const aiMsg = { role: 'model', text: aiText, image: base64 ? `data:image/png;base64,${base64}` : undefined };
      const finalMsgs = [...updatedMsgs, aiMsg];
      
      setChats(prev => prev.map(c => c.id === activeChatId ? { ...c, messages: finalMsgs } : c));
      await setDoc(chatRef, { messagesJson: serializeMessages(finalMsgs) }, { merge: true });

    } catch (err) {
      setError("Connection lost. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl border border-stone-200 w-full max-w-md animate-in fade-in zoom-in-95 duration-500">
          <div className="flex flex-col items-center mb-8">
            <div className="bg-amber-400 p-4 rounded-2xl shadow-lg mb-4">
              <LemonIcon size={48} className="text-stone-900" />
            </div>
            <h1 className="text-3xl font-extrabold text-stone-800">LUMEN</h1>
            <p className="text-stone-500 font-medium tracking-widest uppercase text-xs mt-1">Smart Scripting & Vision</p>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); setIsAuthenticated(true); }} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-stone-500 ml-1">IDENTITY</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 text-stone-400" size={18} />
                <input type="email" required placeholder="you@example.com" className="w-full bg-stone-50 border border-stone-200 rounded-xl py-3 pl-10 pr-4 outline-none focus:ring-2 focus:ring-amber-400/50" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-stone-500 ml-1">KEY</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 text-stone-400" size={18} />
                <input type="password" required placeholder="••••••••" className="w-full bg-stone-50 border border-stone-200 rounded-xl py-3 pl-10 pr-4 outline-none focus:ring-2 focus:ring-amber-400/50" />
              </div>
            </div>
            <button type="submit" className="w-full bg-amber-400 hover:bg-amber-500 text-stone-900 font-bold py-4 rounded-xl shadow-lg transition-all flex items-center justify-center space-x-2 group mt-6">
              <span>{isLoginView ? 'Authenticate' : 'Register'}</span>
              <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </form>
          <button onClick={() => setIsLoginView(!isLoginView)} className="w-full text-center mt-6 text-sm text-stone-500 hover:text-amber-600 transition-colors">
            {isLoginView ? "Need an account? Create one" : "Already registered? Sign in"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-100 text-stone-800 font-sans flex h-screen overflow-hidden">
      {isSidebarOpen && <div className="fixed inset-0 bg-stone-900/20 backdrop-blur-sm z-20 md:hidden" onClick={() => setIsSidebarOpen(false)} />}
      <aside className={`fixed md:relative z-30 h-full bg-stone-50 transition-all duration-300 flex flex-col shrink-0 overflow-hidden ${isSidebarOpen ? 'w-72 border-r border-stone-200' : 'w-0'}`}>
        <div className="w-72 flex flex-col h-full">
          <div className="p-4 border-b border-stone-200 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="bg-amber-400 p-1.5 rounded-lg text-stone-900"><LemonIcon size={20} /></div>
              <h1 className="text-xl font-bold tracking-tight">LUMEN</h1>
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="p-1.5 text-stone-400 hover:bg-stone-200 rounded-md"><X size={20} /></button>
          </div>
          <div className="p-4"><button onClick={handleNewChat} className="w-full flex items-center justify-center space-x-2 bg-white hover:bg-stone-100 text-stone-700 border border-stone-200 py-2.5 rounded-xl transition-all font-medium"><Plus size={18} /><span>New Chat</span></button></div>
          <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1">
            <p className="px-3 text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2 mt-4">History</p>
            {chats.map(chat => (
              <button key={chat.id} onClick={() => switchChat(chat.id)} className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-left transition-all ${activeChatId === chat.id ? 'bg-amber-100/60 text-amber-900 font-medium' : 'text-stone-600 hover:bg-stone-200/60'}`}>
                <MessageSquare size={16} className={activeChatId === chat.id ? 'text-amber-600' : 'text-stone-400'} /><span className="truncate text-sm">{chat.title}</span>
              </button>
            ))}
          </div>
          <div className="p-4 border-t border-stone-200 bg-stone-50 space-y-1">
            <button onClick={() => setIsSettingsOpen(true)} className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-stone-600 hover:bg-stone-200 font-medium transition-all text-sm"><Settings size={18} /><span>Personality</span></button>
            <button onClick={() => setIsAuthenticated(false)} className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-stone-600 hover:bg-stone-200 font-medium transition-all text-sm"><Lock size={18} /><span>Log Out</span></button>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-full bg-stone-50 relative min-w-0">
        <header className="bg-stone-50/90 backdrop-blur-md border-b border-stone-200 p-4 flex items-center justify-between z-10">
          <div className="flex items-center">
            {!isSidebarOpen && <button onClick={() => setIsSidebarOpen(true)} className="p-2 mr-3 text-stone-500 border border-stone-200 rounded-lg hover:bg-stone-100"><Menu size={20} /></button>}
            <div><h2 className="text-lg font-bold truncate md:max-w-md">{activeChat.title}</h2><p className="text-xs text-amber-600 font-medium flex items-center"><Sparkles size={12} className="mr-1 animate-pulse" />Cloud Synced</p></div>
          </div>
          <div className="flex items-center space-x-2">
            <div className="relative">
              <button onClick={() => setIsModeMenuOpen(!isModeMenuOpen)} className={`flex items-center space-x-1.5 text-xs font-bold px-3 py-1.5 rounded-full border shadow-sm transition-all ${activeMode === 'little' ? 'bg-green-50 text-green-700 border-green-200' : activeMode === 'big' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                {activeMode === 'little' ? <Zap size={14} /> : activeMode === 'big' ? <Brain size={14} /> : <Flame size={14} />}
                <span className="hidden sm:inline uppercase tracking-tight">{activeMode} Squeeze</span><ChevronDown size={14} className={isModeMenuOpen ? 'rotate-180' : ''} />
              </button>
              {isModeMenuOpen && <div className="absolute right-0 mt-2 w-48 bg-white border border-stone-200 rounded-xl shadow-xl z-50 p-1 animate-in fade-in slide-in-from-top-2">
                {['little', 'big', 'spicy'].map(m => (
                  <button key={m} onClick={() => { setActiveMode(m); setIsModeMenuOpen(false); }} className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeMode === m ? 'bg-stone-100 text-stone-900' : 'hover:bg-stone-50 text-stone-500'}`}>{m.charAt(0).toUpperCase() + m.slice(1)} Squeeze</button>
                ))}
              </div>}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-stone-100/50">
          {activeChat.messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}>
              <div className={`flex max-w-[90%] sm:max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : 'flex-row'} items-start space-x-3`}>
                <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center shadow-sm ${msg.role === 'user' ? 'bg-amber-400 text-stone-900' : 'bg-white text-amber-600 border border-stone-200'}`}>{msg.role === 'user' ? <User size={16} /> : <LemonIcon size={18} />}</div>
                <div className={`p-4 rounded-2xl shadow-sm leading-relaxed ${msg.role === 'user' ? 'bg-amber-400 text-stone-900 rounded-tr-sm' : 'bg-white text-stone-700 border border-stone-200 rounded-tl-sm'}`}>
                  <MessageContent text={msg.text} />
                  {msg.image && msg.image.startsWith('data:image') && <img src={msg.image} className="mt-4 rounded-xl border border-stone-100 max-w-full shadow-sm" alt="AI Generated" />}
                  {msg.image === "[IMAGE_PLACEHOLDER]" && <div className="mt-3 p-3 bg-stone-100 rounded-lg text-xs text-stone-400 border border-dashed border-stone-300 flex items-center space-x-2"><ImageIcon size={14} /><span>Image context cleared for session performance.</span></div>}
                </div>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start animate-in fade-in"><div className="flex items-start space-x-3">
              <div className="shrink-0 w-8 h-8 rounded-full bg-white text-amber-600 border border-stone-200 flex items-center justify-center shadow-sm"><LemonIcon size={18} /></div>
              <div className="bg-white border border-stone-200 p-4 rounded-2xl rounded-tl-sm flex items-center space-x-2 text-stone-500 shadow-sm"><Loader2 size={16} className="animate-spin text-amber-500" /><span className="text-sm font-medium animate-pulse">{loadingText}</span></div>
            </div></div>
          )}
          {error && <div className="text-center p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm font-medium">{error}</div>}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 sm:p-6 bg-white border-t border-stone-200">
          <form onSubmit={handleSendMessage} className="relative flex items-center max-w-5xl mx-auto group">
            <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask LUMEN for code, images, or answers..." disabled={isLoading} className="w-full bg-stone-50 border border-stone-300 focus:border-amber-400 focus:ring-4 focus:ring-amber-400/10 rounded-2xl py-4 pl-5 pr-14 text-stone-800 placeholder-stone-400 outline-none transition-all disabled:opacity-50" />
            <button type="submit" disabled={!input.trim() || isLoading} className="absolute right-2.5 p-2.5 bg-amber-400 hover:bg-amber-500 disabled:bg-stone-200 disabled:text-stone-400 text-stone-900 rounded-xl transition-all shadow-sm focus:outline-none"><Send size={20} className={input.trim() && !isLoading ? 'translate-x-0.5 -translate-y-0.5' : ''} /></button>
          </form>
          <div className="text-center mt-3 text-[10px] text-stone-400 font-bold uppercase tracking-widest">LUMEN CORE v2.5 • SCRIPTING ENGINE ACTIVE</div>
        </div>
      </main>

      {isSettingsOpen && <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
          <div className="p-6 border-b border-stone-100 flex justify-between items-center bg-stone-50">
            <div className="flex items-center space-x-2 text-stone-800"><Settings size={20} className="text-amber-500" /><h2 className="text-lg font-bold">Personality Settings</h2></div>
            <button onClick={() => setIsSettingsOpen(false)} className="text-stone-400 hover:bg-stone-100 p-2 rounded-xl transition-all"><X size={20} /></button>
          </div>
          <div className="p-6 space-y-4">
            <label className="block text-xs font-bold text-stone-500 uppercase tracking-widest">Base Instructions</label>
            <textarea value={tempPrompt} onChange={(e) => setTempPrompt(e.target.value)} className="w-full h-48 p-4 bg-stone-50 border border-stone-200 rounded-2xl text-sm text-stone-800 focus:ring-4 focus:ring-amber-400/10 focus:border-amber-400 outline-none transition-all resize-none" />
          </div>
          <div className="p-4 border-t border-stone-100 bg-stone-50 flex justify-end space-x-3">
            <button onClick={() => setIsSettingsOpen(false)} className="px-5 py-2.5 text-sm font-bold text-stone-500 hover:text-stone-800 transition-colors">Cancel</button>
            <button onClick={() => { setSystemPrompt(tempPrompt); setIsSettingsOpen(false); }} className="px-6 py-2.5 bg-amber-400 text-stone-900 font-bold rounded-xl shadow-lg hover:bg-amber-500 transition-all">Save Changes</button>
          </div>
        </div>
      </div>}
    </div>
  );
}