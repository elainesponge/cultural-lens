
import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, ConsultantLevel, ChatSession, AUDIENCE_GROUPS, AppSettings, KnowledgeFile } from '../types';
import { consultCulturalAgent, processImageForGemini } from '../services/geminiService';
import { Send, User, Bot, MessageSquare, Plus, Globe, CheckSquare, Square, ChevronRight, Trash2, Zap, BookOpen, Library, FileText, ExternalLink, Search, Image as ImageIcon, X, Edit, Globe2, Key } from 'lucide-react';
import MoodCard from './MoodCard';
import MarkdownRenderer from './MarkdownRenderer';
import KnowledgeDrawer from './KnowledgeDrawer';

interface ConsultantViewProps {
  settings: AppSettings;
  knowledgeFiles: KnowledgeFile[];
  onUploadKnowledge: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAddLink: (url: string) => void;
  onRemoveKnowledge: (id: string) => void;
  onToggleKnowledgeActive?: (id: string) => void;
  onToggleAllKnowledge?: (active: boolean) => void;
  isUploadingKnowledge: boolean;
}

// Helper: Improved Fuzzy Matching for Sources
const getSourceLink = (sourceName: string, knowledgeFiles: KnowledgeFile[], groundingMetadata?: any): string | null => {
    // 1. Is it a direct URL?
    if (sourceName.startsWith('http://') || sourceName.startsWith('https://')) {
        return sourceName;
    }

    // 2. Is it a Knowledge Base Link or File?
    const kbFile = knowledgeFiles.find(f => f.name === sourceName);
    if (kbFile) {
        if (kbFile.sourceType === 'LINK') return kbFile.name;
        // Files don't have public URLs usually
        if (kbFile.sourceType === 'FILE') return null;
    }

    // 3. Smart Matching in Grounding Metadata
    if (groundingMetadata?.groundingChunks) {
        const lowerSource = sourceName.toLowerCase();
        const chunks = groundingMetadata.groundingChunks;

        // A. Title Match (Source name is inside title or vice versa)
        let chunk = chunks.find((c: any) => {
             if (!c.web?.title) return false;
             const lowerTitle = c.web.title.toLowerCase();
             return lowerTitle.includes(lowerSource) || lowerSource.includes(lowerTitle);
        });

        // B. URI Match (Domain name check)
        if (!chunk) {
             chunk = chunks.find((c: any) => {
                 if (!c.web?.uri) return false;
                 return c.web.uri.toLowerCase().includes(lowerSource);
             });
        }

        // C. Token Match (Matches at least one significant word)
        if (!chunk) {
             const sourceTokens = lowerSource.split(/[\s\-_]+/).filter(t => t.length > 3);
             if (sourceTokens.length > 0) {
                 chunk = chunks.find((c: any) => {
                     if (!c.web?.title) return false;
                     const lowerTitle = c.web.title.toLowerCase();
                     // Strict: All tokens must match
                     return sourceTokens.every(token => lowerTitle.includes(token));
                 });
             }
        }
        
        if (chunk?.web?.uri) {
            return chunk.web.uri;
        }
    }

    // 4. Fallback: Google Search
    return `https://www.google.com/search?q=${encodeURIComponent(sourceName)}`;
};

const ConsultantView: React.FC<ConsultantViewProps> = ({ 
    settings,
    knowledgeFiles,
    onUploadKnowledge,
    onAddLink,
    onRemoveKnowledge,
    onToggleKnowledgeActive,
    onToggleAllKnowledge,
    isUploadingKnowledge
}) => {
  // Session Management
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  
  // New Chat Setup State
  const [isSetupMode, setIsSetupMode] = useState(true);
  const [setupAudience, setSetupAudience] = useState<string[]>([]);
  
  // Chat State
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [useSearch, setUseSearch] = useState(false);
  const [useKnowledgeBase, setUseKnowledgeBase] = useState(true);
  
  // Image Input State
  const [chatImages, setChatImages] = useState<File[]>([]);
  const [chatImagePreviews, setChatImagePreviews] = useState<string[]>([]);
  
  // Context Switching State
  const [isContextDropdownOpen, setIsContextDropdownOpen] = useState(false);
  const contextDropdownRef = useRef<HTMLDivElement>(null);
  const [tempContext, setTempContext] = useState<string[]>([]);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Knowledge Base UI State
  const [showKnowledge, setShowKnowledge] = useState(false);

  const activeKnowledgeCount = knowledgeFiles.filter(f => f.isActive).length;

  useEffect(() => {
    const saved = localStorage.getItem('cultural_chat_sessions');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            setSessions(parsed);
        } catch (e) { console.error("Error loading chat sessions"); }
    }
  }, []);

  useEffect(() => {
      localStorage.setItem('cultural_chat_sessions', JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [sessions, currentSessionId, loading]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [inputValue]);

  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (contextDropdownRef.current && !contextDropdownRef.current.contains(event.target as Node)) {
              setIsContextDropdownOpen(false);
          }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const startNewChat = () => {
      setIsSetupMode(true);
      setCurrentSessionId(null);
      setSetupAudience([]);
      setChatImages([]);
      setChatImagePreviews([]);
  };

  const createSession = () => {
      if (setupAudience.length === 0) return;
      
      const newSession: ChatSession = {
          id: Date.now().toString(),
          title: "New Conversation",
          timestamp: Date.now(),
          audience: setupAudience,
          level: ConsultantLevel.FAST,
          knowledgeFiles: [],
          messages: [{ 
              role: 'model', 
              text: `Hello! I'm your Cultural Consultant. I'm ready to help you design for **${setupAudience.join(", ")}**.\n\nAsk me about festivals, colors, or symbols, or upload documents to your Knowledge Base.` 
          }]
      };
      
      setSessions(prev => [newSession, ...prev]);
      setCurrentSessionId(newSession.id);
      setIsSetupMode(false);
  };

  const loadSession = (id: string) => {
      setCurrentSessionId(id);
      setIsSetupMode(false);
      setChatImages([]);
      setChatImagePreviews([]);
  };

  const deleteSession = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      setSessions(prev => prev.filter(s => s.id !== id));
      if (currentSessionId === id) {
          startNewChat();
      }
  };

  const currentSession = sessions.find(s => s.id === currentSessionId);

  const updateCurrentSession = (updatedSession: ChatSession) => {
      setSessions(prev => prev.map(s => s.id === updatedSession.id ? updatedSession : s));
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
          const newFiles = Array.from(e.target.files) as File[];
          setChatImages(prev => [...prev, ...newFiles]);
          try {
             const newPreviews = await Promise.all(newFiles.map(async file => {
                 const { base64, mimeType } = await processImageForGemini(file);
                 return `data:${mimeType};base64,${base64}`;
             }));
             setChatImagePreviews(prev => [...prev, ...newPreviews]);
          } catch (err) {
              alert("Failed to load one or more images");
          }
      }
  };

  const removeChatImage = (index: number) => {
      setChatImages(prev => prev.filter((_, i) => i !== index));
      setChatImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  const clearChatImages = () => {
      setChatImages([]);
      setChatImagePreviews([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleConnectGoogle = async () => {
      if (window.aistudio) {
          try {
              await window.aistudio.openSelectKey();
              alert("Connected! Please try sending your message again.");
          } catch (e) {
              console.error("Failed to open key selector", e);
          }
      } else {
          alert("Key selection is not supported here. Please enter a valid API key in Settings.");
      }
  };

  const handleSend = async () => {
    if (loading) return; 
    if ((!inputValue.trim() && chatImages.length === 0) || !currentSession) return;

    const userMsg: ChatMessage = { 
        role: 'user', 
        text: inputValue,
        images: chatImagePreviews.length > 0 ? [...chatImagePreviews] : undefined
    };
    
    const updatedTitle = currentSession.messages.length <= 1 && inputValue 
        ? (inputValue.slice(0, 30) + (inputValue.length > 30 ? "..." : "")) 
        : currentSession.title;

    let updatedSession = {
        ...currentSession,
        title: updatedTitle,
        messages: [...currentSession.messages, userMsg],
    };
    
    const placeholderMsg: ChatMessage = {
        role: 'model',
        text: '',
        isTyping: true
    };
    updatedSession.messages.push(placeholderMsg);

    updateCurrentSession(updatedSession);
    
    const currentInput = inputValue;
    setInputValue('');
    setLoading(true);
    
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    let imagesBase64: string[] = [];
    if (chatImages.length > 0) {
        try {
            const results = await Promise.all(chatImages.map((f: File) => processImageForGemini(f)));
            imagesBase64 = results.map(r => r.base64);
        } catch (e) {
            console.error("Failed to process images for sending", e);
        }
    }
    
    clearChatImages();

    try {
        const activeSessionId = currentSessionId;
        const effectiveFiles = useKnowledgeBase ? knowledgeFiles : [];

        const response = await consultCulturalAgent(
            currentInput || (imagesBase64.length > 0 ? "Analyze these images" : ""), 
            updatedSession.messages.slice(0, -1), 
            updatedSession.level,
            updatedSession.audience,
            effectiveFiles, 
            settings.apiKey,
            settings.generalModel,
            imagesBase64,
            useSearch, 
            settings.consultantSystemPrompt,
            (partialText) => {
                setSessions(prevSessions => {
                    return prevSessions.map(s => {
                        if (s.id === activeSessionId) {
                            const msgs = [...s.messages];
                            const lastMsgIdx = msgs.length - 1;
                            if (lastMsgIdx >= 0 && msgs[lastMsgIdx].role === 'model') {
                                msgs[lastMsgIdx] = { ...msgs[lastMsgIdx], text: partialText };
                            }
                            return { ...s, messages: msgs };
                        }
                        return s;
                    });
                });
            }
        );

        setSessions(prevSessions => {
             return prevSessions.map(s => {
                 if (s.id === activeSessionId) {
                     const msgs = [...s.messages];
                     const lastMsgIdx = msgs.length - 1;
                     if (lastMsgIdx >= 0 && msgs[lastMsgIdx].role === 'model') {
                         msgs[lastMsgIdx] = { 
                             ...msgs[lastMsgIdx], 
                             text: response.text, 
                             moodCards: response.moodCards,
                             citedSources: response.citedSources,
                             groundingMetadata: response.groundingMetadata,
                             isTyping: false
                         };
                     }
                     return { ...s, messages: msgs };
                 }
                 return s;
             });
        });

    } catch (error: any) {
        console.error("Chat Error:", error);
        setSessions(prevSessions => {
             return prevSessions.map(s => {
                 if (s.id === currentSessionId) {
                     const msgs = [...s.messages];
                     const lastMsgIdx = msgs.length - 1;
                     if (lastMsgIdx >= 0 && msgs[lastMsgIdx].isTyping) {
                         const isPermError = error.message === "PERMISSION_DENIED_PRO_MODEL";
                         const errorMsg = isPermError 
                            ? "ERROR_PERM_DENIED" 
                            : "Sorry, I encountered an error. Please check your API key and connection.";
                         
                         msgs[lastMsgIdx] = {
                             ...msgs[lastMsgIdx],
                             text: errorMsg,
                             isTyping: false
                         };
                     }
                     return { ...s, messages: msgs };
                 }
                 return s;
             });
        });
    } finally {
        setLoading(false);
    }
  };

  const handleLevelChange = (newLevel: ConsultantLevel) => {
      if (!currentSession) return;
      updateCurrentSession({ ...currentSession, level: newLevel });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!loading) {
            handleSend();
        }
    }
  };

  const toggleSetupAudience = (label: string) => {
      if (setupAudience.includes(label)) {
          setSetupAudience(prev => prev.filter(l => l !== label));
      } else {
          setSetupAudience(prev => [...prev, label]);
      }
  };

  const toggleTempContext = (label: string) => {
      if (tempContext.includes(label)) {
          setTempContext(prev => prev.filter(l => l !== label));
      } else {
          setTempContext(prev => [...prev, label]);
      }
  };

  const applyContextChange = () => {
      if (!currentSession || tempContext.length === 0) return;
      
      const hasChanged = JSON.stringify([...tempContext].sort()) !== JSON.stringify([...currentSession.audience].sort());
      
      if (hasChanged) {
          const updateMsg: ChatMessage = {
              role: 'model',
              text: `Context switched. I am now focusing on **${tempContext.join(", ")}**.`
          };
          
          updateCurrentSession({
              ...currentSession,
              audience: tempContext,
              messages: [...currentSession.messages, updateMsg]
          });
      }
      setIsContextDropdownOpen(false);
  };

  return (
    <div className="flex h-full w-full bg-white overflow-hidden">
        
        <div className="w-64 border-r border-gray-200 bg-gray-50 flex flex-col h-full flex-shrink-0 z-20 hidden md:flex">
            <div className="p-4">
                <button 
                    onClick={startNewChat}
                    className="w-full flex items-center justify-center gap-2 bg-excali-purple text-white py-3 rounded-lg font-hand font-bold text-lg hover:shadow-sketch transition-all"
                >
                    <Plus size={20} /> New Chat
                </button>
            </div>
            
            <div className="flex-1 overflow-y-auto px-2 space-y-1">
                {sessions.length === 0 && (
                    <div className="text-center text-gray-400 font-hand py-10">No chats yet</div>
                )}
                {sessions.map(session => (
                    <div 
                        key={session.id} 
                        onClick={() => loadSession(session.id)}
                        className={`group p-3 rounded-lg cursor-pointer flex items-center gap-3 transition-colors relative ${currentSessionId === session.id ? 'bg-white shadow-sm border border-gray-200' : 'hover:bg-gray-100 border border-transparent'}`}
                    >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-xs ${currentSessionId === session.id ? 'bg-excali-purpleLight text-excali-purple' : 'bg-gray-200 text-gray-500'}`}>
                            {session.audience[0]?.[0] || 'C'}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className={`font-hand font-bold truncate ${currentSessionId === session.id ? 'text-gray-900' : 'text-gray-600'}`}>
                                {session.title}
                            </div>
                            <div className="text-[10px] text-gray-400 truncate">
                                {new Date(session.timestamp).toLocaleDateString()}
                            </div>
                        </div>
                         <button 
                            onClick={(e) => deleteSession(e, session.id)}
                            className="absolute right-2 top-3 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors opacity-0 group-hover:opacity-100"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                ))}
            </div>
        </div>

        <div className="flex-1 flex flex-col h-full relative">
            
            <KnowledgeDrawer 
                isOpen={showKnowledge}
                onClose={() => setShowKnowledge(false)}
                files={knowledgeFiles}
                onUpload={onUploadKnowledge}
                onAddLink={onAddLink}
                onRemove={onRemoveKnowledge}
                onToggleActive={onToggleKnowledgeActive}
                onToggleAll={onToggleAllKnowledge}
                isUploading={isUploadingKnowledge}
                description="Upload brand guidelines, color palettes, or research documents here."
            />

            {(isSetupMode || !currentSession) ? (
                <div className="flex-1 flex flex-col items-center justify-center p-6 bg-dots animate-in fade-in duration-300">
                    <div className="max-w-2xl w-full bg-white p-8 rounded-3xl shadow-sketch border border-gray-200 relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-2 bg-excali-purple"></div>
                        
                        <div className="flex justify-center mb-6">
                            <div className="w-16 h-16 bg-excali-purpleLight rounded-full flex items-center justify-center text-excali-purple">
                                <MessageSquare size={32} />
                            </div>
                        </div>

                        <h2 className="font-hand text-3xl font-bold text-center text-gray-800 mb-2">New Consultation</h2>
                        <p className="font-sans text-center text-gray-500 mb-8 max-w-md mx-auto">
                            Who are you designing for today? I'll tailor my advice to their cultural context.
                        </p>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
                            {AUDIENCE_GROUPS.map(group => {
                                const isSelected = setupAudience.includes(group.label);
                                return (
                                    <button
                                        key={group.label}
                                        onClick={() => toggleSetupAudience(group.label)}
                                        className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all ${isSelected ? 'border-excali-purple bg-excali-purpleLight/20 shadow-sm' : 'border-gray-100 bg-gray-50 hover:bg-white hover:border-gray-200'}`}
                                    >
                                        <div className={`transition-colors ${isSelected ? 'text-excali-purple' : 'text-gray-300'}`}>
                                            {isSelected ? <CheckSquare size={20} /> : <Square size={20} />}
                                        </div>
                                        <span className={`font-hand font-bold text-lg ${isSelected ? 'text-gray-800' : 'text-gray-500'}`}>
                                            {group.label}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        <button 
                            onClick={createSession}
                            disabled={setupAudience.length === 0}
                            className="w-full bg-excali-purple text-white font-hand font-bold text-xl py-3 rounded-xl shadow-sketch hover:shadow-sketch-hover hover:-translate-y-1 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:transform-none flex items-center justify-center gap-2"
                        >
                            Start Chat <ChevronRight size={24} />
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    <div className="h-16 border-b border-gray-200 bg-white flex items-center justify-between px-4 md:px-6 flex-shrink-0 z-10 shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
                        <div className="flex items-center gap-3">
                             <button onClick={startNewChat} className="md:hidden p-2 text-gray-400 hover:bg-gray-100 rounded-full"><ChevronRight className="rotate-180" size={20} /></button>
                             
                             <div className="relative" ref={contextDropdownRef}>
                                 <button 
                                    onClick={() => {
                                        setTempContext(currentSession.audience);
                                        setIsContextDropdownOpen(!isContextDropdownOpen);
                                    }}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors group"
                                 >
                                     <Globe size={16} className="text-excali-purple" />
                                     <span className="font-hand font-bold text-gray-700">{currentSession.audience.join(", ")}</span>
                                     <Edit size={12} className="text-gray-400 opacity-0 group-hover:opacity-100" />
                                 </button>
                                 
                                 {isContextDropdownOpen && (
                                     <div className="absolute top-full left-0 mt-2 w-72 bg-white border border-gray-200 rounded-xl shadow-xl p-4 z-50 animate-in fade-in zoom-in-95 duration-100">
                                         <h4 className="font-bold text-xs uppercase text-gray-400 mb-3">Switch Context</h4>
                                         <div className="space-y-2 mb-4 max-h-[200px] overflow-y-auto">
                                            {AUDIENCE_GROUPS.map(group => (
                                                <button
                                                    key={group.label}
                                                    onClick={() => toggleTempContext(group.label)}
                                                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-sm font-hand font-bold ${tempContext.includes(group.label) ? 'bg-excali-purpleLight/30 text-excali-purple' : 'hover:bg-gray-50 text-gray-600'}`}
                                                >
                                                    {tempContext.includes(group.label) ? <CheckSquare size={14}/> : <Square size={14}/>}
                                                    {group.label}
                                                </button>
                                            ))}
                                         </div>
                                         <button 
                                            onClick={applyContextChange}
                                            disabled={tempContext.length === 0}
                                            className="w-full bg-excali-purple text-white py-2 rounded-lg text-sm font-bold shadow-sm disabled:opacity-50"
                                         >
                                             Apply Change
                                         </button>
                                     </div>
                                 )}
                             </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button 
                                onClick={() => handleLevelChange(currentSession.level === ConsultantLevel.FAST ? ConsultantLevel.DEEP : ConsultantLevel.FAST)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${currentSession.level === ConsultantLevel.FAST ? 'bg-orange-50 text-orange-600 border-orange-100' : 'bg-purple-50 text-purple-600 border-purple-100'}`}
                            >
                                {currentSession.level === ConsultantLevel.FAST ? <Zap size={14} /> : <BookOpen size={14} />}
                                {currentSession.level}
                            </button>

                             <button 
                                onClick={() => setShowKnowledge(!showKnowledge)}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ml-2 border ${showKnowledge ? 'bg-excali-purple text-white border-excali-purple' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                            >
                                <Library size={14} />
                                <span className="hidden sm:inline">Knowledge</span>
                                {activeKnowledgeCount > 0 && (
                                    <span className={`px-1.5 rounded-full text-[10px] ${showKnowledge ? 'bg-white text-excali-purple' : 'bg-gray-200 text-gray-600'}`}>
                                        {activeKnowledgeCount}
                                    </span>
                                )}
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-dots" ref={scrollRef}>
                        <div className="max-w-4xl mx-auto space-y-8">
                            {currentSession.messages.map((msg, idx) => (
                                <div key={idx} className={`flex gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                                    
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm border border-gray-100 ${msg.role === 'user' ? 'bg-gray-800 text-white' : 'bg-white text-excali-purple'}`}>
                                        {msg.role === 'user' ? <User size={20} /> : <Bot size={20} />}
                                    </div>

                                    <div className={`flex flex-col gap-2 max-w-[85%] md:max-w-[75%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                        
                                        {msg.images && msg.images.length > 0 && (
                                            <div className="flex flex-wrap gap-2 mb-2 justify-end">
                                                {msg.images.map((img, i) => (
                                                    <img key={i} src={img} alt="Attachment" className="h-32 w-auto rounded-lg border-2 border-white shadow-sm object-cover" />
                                                ))}
                                            </div>
                                        )}

                                        <div className={`p-5 rounded-2xl shadow-sm border ${msg.role === 'user' ? 'bg-gray-800 text-white border-gray-700 rounded-tr-none' : 'bg-white text-gray-800 border-gray-100 rounded-tl-none'}`}>
                                            {msg.isTyping && !msg.text ? (
                                                <div className="flex gap-1 h-6 items-center px-2">
                                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                                                </div>
                                            ) : (
                                                <>
                                                    {msg.text === "ERROR_PERM_DENIED" ? (
                                                        <div className="flex flex-col gap-2 text-red-600">
                                                            <div className="flex items-center gap-2 font-bold">
                                                                <Key size={16} /> Access Denied
                                                            </div>
                                                            <p className="text-sm">The selected model (Gemini 3.0 Pro) requires a connected Google Account.</p>
                                                            {window.aistudio && (
                                                                <button 
                                                                    onClick={handleConnectGoogle}
                                                                    className="mt-1 bg-white text-gray-700 border border-gray-300 px-3 py-1.5 rounded-full text-xs font-bold hover:bg-gray-50 transition-colors self-start flex items-center gap-2 shadow-sm"
                                                                >
                                                                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="G" className="h-4 w-4" />
                                                                    Continue with Google
                                                                </button>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <MarkdownRenderer content={msg.text || ""} />
                                                    )}
                                                </>
                                            )}

                                            {/* Smart Sources Section */}
                                            {(msg.groundingMetadata?.groundingChunks || (msg.citedSources && msg.citedSources.length > 0)) && (
                                                <div className="mt-4 pt-3 border-t border-gray-100/50 flex flex-col gap-2">
                                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                                        <Search size={10} /> Sources & Citations
                                                    </span>
                                                    <div className="flex flex-wrap gap-2">
                                                        {/* 1. Grounding Chunks (Web) */}
                                                        {msg.groundingMetadata?.groundingChunks?.map((chunk: any, i: number) => {
                                                            if (!chunk.web?.uri) return null;
                                                            return (
                                                                <a 
                                                                    key={`web-${i}`}
                                                                    href={chunk.web.uri}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 hover:bg-white border border-gray-200 hover:border-blue-200 hover:shadow-sm rounded-lg text-xs text-gray-600 transition-all group max-w-full"
                                                                >
                                                                    <div className="w-4 h-4 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                                                                        <span className="text-[8px] font-bold">{i+1}</span>
                                                                    </div>
                                                                    <span className="truncate max-w-[150px]">{chunk.web.title || "Web Source"}</span>
                                                                    <ExternalLink size={10} className="opacity-0 group-hover:opacity-100 text-blue-400" />
                                                                </a>
                                                            )
                                                        })}

                                                        {/* 2. Cited Sources (Files/Other) */}
                                                        {msg.citedSources?.map((src, i) => {
                                                             const link = getSourceLink(src, knowledgeFiles, msg.groundingMetadata);
                                                             if (!link || link.includes('google.com/search')) return null; 

                                                             return (
                                                                <a 
                                                                    key={`cite-${i}`}
                                                                    href={link}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="flex items-center gap-2 px-3 py-1.5 bg-purple-50 hover:bg-white border border-purple-100 hover:border-purple-200 hover:shadow-sm rounded-lg text-xs text-purple-700 transition-all"
                                                                >
                                                                     <FileText size={12} />
                                                                     <span className="truncate max-w-[150px]">{src}</span>
                                                                </a>
                                                             );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {msg.moodCards && msg.moodCards.length > 0 && (
                                            <div className="w-full mt-2 overflow-x-auto pb-4 pt-2 px-1 flex gap-4 snap-x custom-scrollbar">
                                                {msg.moodCards.map((card, i) => (
                                                    <MoodCard key={i} data={card} settings={settings} />
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="p-4 bg-white border-t border-gray-200">
                        <div className="max-w-4xl mx-auto flex flex-col gap-2 relative">
                            {chatImagePreviews.length > 0 && (
                                <div className="flex gap-3 pb-2 overflow-x-auto">
                                    {chatImagePreviews.map((src, i) => (
                                        <div key={i} className="relative group">
                                            <img src={src} alt="Preview" className="h-16 w-16 object-cover rounded-lg border border-gray-200" />
                                            <button 
                                                onClick={() => removeChatImage(i)}
                                                className="absolute -top-1.5 -right-1.5 bg-gray-900 text-white rounded-full p-0.5 shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="flex gap-2 items-end bg-gray-50 border border-gray-200 rounded-2xl p-2 shadow-sm focus-within:ring-2 focus-within:ring-excali-purple/20 focus-within:border-excali-purple transition-all">
                                <button 
                                    onClick={() => fileInputRef.current?.click()}
                                    className="p-2 text-gray-400 hover:text-excali-purple hover:bg-white rounded-xl transition-colors flex-shrink-0"
                                    title="Add Image"
                                >
                                    <ImageIcon size={20} />
                                </button>
                                <input 
                                    type="file" 
                                    ref={fileInputRef} 
                                    multiple 
                                    accept="image/*" 
                                    className="hidden" 
                                    onChange={handleImageSelect}
                                />

                                <button 
                                    onClick={() => setUseKnowledgeBase(!useKnowledgeBase)}
                                    disabled={activeKnowledgeCount === 0}
                                    className={`relative group p-2 rounded-xl transition-colors flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${useKnowledgeBase ? 'bg-excali-purpleLight/30 text-excali-purple border border-excali-purpleLight' : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100'}`}
                                >
                                    <BookOpen size={20} />
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                                        {useKnowledgeBase ? 'Use Knowledge Base' : 'Ignore Knowledge Base'}
                                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800"></div>
                                    </div>
                                </button>
                                
                                <button 
                                    onClick={() => setUseSearch(!useSearch)}
                                    className={`relative group p-2 rounded-xl transition-colors flex-shrink-0 ${useSearch ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100'}`}
                                >
                                    <Globe2 size={20} />
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                                        Web search
                                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800"></div>
                                    </div>
                                </button>

                                <textarea
                                    ref={textareaRef}
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder="Ask about cultural symbols, meanings, or festivals..."
                                    className="flex-1 bg-transparent border-none resize-none focus:ring-0 py-3 px-2 max-h-32 text-gray-900 placeholder-gray-500 font-sans leading-relaxed caret-excali-purple"
                                    rows={1}
                                />
                                
                                <button 
                                    onClick={handleSend}
                                    disabled={!inputValue.trim() && chatImages.length === 0 || loading}
                                    className={`p-2 rounded-xl transition-all flex-shrink-0 mb-0.5 ${inputValue.trim() || chatImages.length > 0 ? 'bg-excali-purple text-white shadow-md hover:shadow-lg hover:-translate-y-0.5' : 'bg-gray-200 text-gray-400'}`}
                                >
                                    <Send size={20} className={loading ? 'hidden' : 'block'} />
                                    <div className={`w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin ${loading ? 'block' : 'hidden'}`}></div>
                                </button>
                            </div>
                            <div className="text-[10px] text-gray-400 px-2 flex justify-between">
                                <span>{chatImages.length > 0 ? `${chatImages.length} images attached` : ''}</span>
                                <span>{loading ? "Agent is thinking..." : "Press Enter to send"}</span>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    </div>
  );
};

export default ConsultantView;
