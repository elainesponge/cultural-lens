
import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, ConsultantLevel, ChatSession, AUDIENCE_GROUPS, AppSettings, KnowledgeFile } from '../types';
import { consultCulturalAgent, processImageForGemini } from '../services/geminiService';
import { Send, User, Bot, MessageSquare, Plus, Globe, CheckSquare, Square, ChevronRight, Trash2, Zap, BookOpen, Library, FileText, ExternalLink, Search, Image as ImageIcon, X, Edit } from 'lucide-react';
import MoodCard from './MoodCard';
import MarkdownRenderer from './MarkdownRenderer';
import KnowledgeDrawer from './KnowledgeDrawer';

interface ConsultantViewProps {
  settings: AppSettings;
  knowledgeFiles: KnowledgeFile[];
  onUploadKnowledge: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAddLink: (url: string) => void;
  onRemoveKnowledge: (id: string) => void;
  isUploadingKnowledge: boolean;
}

const ConsultantView: React.FC<ConsultantViewProps> = ({ 
    settings,
    knowledgeFiles,
    onUploadKnowledge,
    onAddLink,
    onRemoveKnowledge,
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
  
  // Image Input State
  const [chatImage, setChatImage] = useState<File | null>(null);
  const [chatImagePreview, setChatImagePreview] = useState<string | null>(null);
  
  // Context Switching State
  const [isContextDropdownOpen, setIsContextDropdownOpen] = useState(false);
  const contextDropdownRef = useRef<HTMLDivElement>(null);
  const [tempContext, setTempContext] = useState<string[]>([]);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Knowledge Base UI State
  const [showKnowledge, setShowKnowledge] = useState(false);

  // Load Sessions from LocalStorage
  useEffect(() => {
    const saved = localStorage.getItem('cultural_chat_sessions');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            setSessions(parsed);
        } catch (e) { console.error("Error loading chat sessions"); }
    }
  }, []);

  // Save Sessions to LocalStorage
  useEffect(() => {
      localStorage.setItem('cultural_chat_sessions', JSON.stringify(sessions));
  }, [sessions]);

  // Scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [sessions, currentSessionId, loading]);

  // Auto-resize Textarea
  useEffect(() => {
    if (textareaRef.current) {
      // Reset height to allow shrinking
      textareaRef.current.style.height = 'auto';
      // Set to scrollHeight to expand
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [inputValue]);

  // Close dropdown on click outside
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
      setChatImage(null);
      setChatImagePreview(null);
  };

  const createSession = () => {
      if (setupAudience.length === 0) return;
      
      const newSession: ChatSession = {
          id: Date.now().toString(),
          title: "New Conversation",
          timestamp: Date.now(),
          audience: setupAudience,
          level: ConsultantLevel.FAST,
          knowledgeFiles: [], // Deprecated in favor of global, but kept for type compat if needed
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
      setChatImage(null);
      setChatImagePreview(null);
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
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          setChatImage(file);
          try {
             // Process preview immediately to show the optimized version
             const { base64, mimeType } = await processImageForGemini(file);
             setChatImagePreview(`data:${mimeType};base64,${base64}`);
          } catch (err) {
              alert("Failed to load image");
          }
      }
  };

  const clearChatImage = () => {
      setChatImage(null);
      setChatImagePreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSend = async () => {
    if (loading) return; // Prevent send if already loading
    if ((!inputValue.trim() && !chatImage) || !currentSession) return;

    // Add user message
    const userMsg: ChatMessage = { role: 'user', text: inputValue };
    // In a real app, we might want to store the image in the message history too, but for now we just send it.
    
    const updatedSession = {
        ...currentSession,
        messages: [...currentSession.messages, userMsg],
        title: currentSession.messages.length <= 1 && inputValue ? inputValue.slice(0, 30) + (inputValue.length > 30 ? "..." : "") : currentSession.title
    };
    
    updateCurrentSession(updatedSession);
    const currentInput = inputValue;
    setInputValue('');
    setLoading(true);
    
    // Reset textarea height manually after send
    if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
    }

    // Convert image if present using optimized helper
    let imageBase64 = undefined;
    if (chatImage) {
        try {
            const { base64 } = await processImageForGemini(chatImage);
            imageBase64 = base64;
        } catch (e) {
            console.error("Failed to process image", e);
        }
    }
    
    // Clear image state after sending
    clearChatImage();

    // Call API with RAG (using GLOBAL knowledgeFiles) + Web Search + Optional Image
    const response = await consultCulturalAgent(
        currentInput || (imageBase64 ? "Analyze this image" : ""), 
        updatedSession.messages, 
        currentSession.level,
        currentSession.audience,
        knowledgeFiles, // Use Global Files
        settings.apiKey,
        settings.generalModel,
        imageBase64, // Pass image
        settings.consultantSystemPrompt // Pass custom prompt
    );

    const modelMsg: ChatMessage = {
        role: 'model',
        text: response.text,
        moodCards: response.moodCards,
        citedSources: response.citedSources,
        groundingMetadata: response.groundingMetadata
    };

    updateCurrentSession({
        ...updatedSession,
        messages: [...updatedSession.messages, modelMsg]
    });
    setLoading(false);
  };

  const handleLevelChange = (newLevel: ConsultantLevel) => {
      if (!currentSession) return;
      updateCurrentSession({ ...currentSession, level: newLevel });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        // Only send if NOT loading
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

  // Switch Context (In-Chat)
  const toggleTempContext = (label: string) => {
      if (tempContext.includes(label)) {
          setTempContext(prev => prev.filter(l => l !== label));
      } else {
          setTempContext(prev => [...prev, label]);
      }
  };

  const applyContextChange = () => {
      if (!currentSession || tempContext.length === 0) return;
      
      // Fix: Avoid mutating the arrays with .sort() in place. Create copies first.
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
        
        {/* SIDEBAR: Session List */}
        <div className="w-64 border-r border-gray-200 bg-gray-50 flex flex-col h-full flex-shrink-0 z-20 hidden md:flex">
            <div className="p-4">
                <button 
                    onClick={startNewChat}
                    className="w-full flex items-center justify-center gap-2 bg-excali-purple text-white py-3 rounded-lg font-hand font-bold text-lg hover:shadow-md transition-all active:scale-95"
                >
                    <Plus size={20} /> New Chat
                </button>
            </div>
            
            <div className="flex-1 overflow-y-auto px-2 space-y-1 custom-scrollbar pb-4">
                {sessions.length > 0 && (
                    <div className="px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center justify-between">
                        <span>Recent</span>
                    </div>
                )}
                {sessions.map(session => (
                    <div
                        key={session.id}
                        onClick={() => loadSession(session.id)}
                        className={`group w-full text-left p-3 rounded-lg flex items-start gap-3 transition-colors cursor-pointer relative ${currentSessionId === session.id ? 'bg-white shadow-sm border border-gray-200' : 'hover:bg-gray-100'}`}
                    >
                        <MessageSquare size={18} className={`mt-0.5 flex-shrink-0 ${currentSessionId === session.id ? 'text-excali-purple' : 'text-gray-400'}`} />
                        <div className="overflow-hidden flex-1 min-w-0 pr-6">
                            <div className={`font-hand font-bold text-sm truncate ${currentSessionId === session.id ? 'text-gray-800' : 'text-gray-500'}`}>
                                {session.title}
                            </div>
                            <div className="text-[10px] text-gray-400 mt-1 truncate">
                                {session.audience.join(", ")}
                            </div>
                        </div>
                        <button 
                            onClick={(e) => deleteSession(e, session.id)}
                            className="absolute right-2 top-2 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-all"
                            title="Delete Chat"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                ))}
            </div>
        </div>

        {/* MAIN AREA */}
        <div className="flex-1 flex flex-col relative bg-dots h-full min-w-0">
            
            {/* SETUP SCREEN */}
            {isSetupMode ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 animate-in zoom-in-95 duration-300 overflow-y-auto">
                    <div className="bg-white p-8 rounded-2xl shadow-sketch max-w-2xl w-full border border-gray-200">
                        <div className="text-center mb-8">
                            <div className="w-16 h-16 bg-excali-purpleLight text-excali-purple rounded-full flex items-center justify-center mx-auto mb-4">
                                <Globe size={32} />
                            </div>
                            <h2 className="font-hand text-3xl font-bold text-gray-800 mb-2">Who are we designing for?</h2>
                            <p className="font-sans text-gray-500">Select the target regions to tailor the cultural context.</p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8 max-h-[300px] overflow-y-auto custom-scrollbar p-1">
                            {AUDIENCE_GROUPS.map(group => {
                                const isSelected = setupAudience.includes(group.label);
                                return (
                                    <button
                                        key={group.label}
                                        onClick={() => toggleSetupAudience(group.label)}
                                        className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${isSelected ? 'border-excali-purple bg-excali-purpleLight/10' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'}`}
                                    >
                                        <div className={`text-excali-purple transition-transform ${isSelected ? 'scale-110' : 'opacity-30'}`}>
                                            {isSelected ? <CheckSquare size={24} /> : <Square size={24} />}
                                        </div>
                                        <span className={`font-hand font-bold text-lg ${isSelected ? 'text-gray-900' : 'text-gray-500'}`}>
                                            {group.label}
                                        </span>
                                    </button>
                                )
                            })}
                        </div>

                        <button 
                            onClick={createSession}
                            disabled={setupAudience.length === 0}
                            className="w-full bg-excali-purple text-white font-hand font-bold text-xl py-4 rounded-xl shadow-sketch hover:shadow-sketch-hover hover:-translate-y-1 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            Start Consultation <ChevronRight size={24} />
                        </button>
                    </div>
                </div>
            ) : (
                /* CHAT INTERFACE */
                <>
                    {/* Header */}
                    <div className="h-16 bg-white/80 backdrop-blur-md border-b border-gray-200 flex items-center justify-between px-3 md:px-6 z-10 sticky top-0">
                         <div className="flex items-center gap-2 md:gap-4 min-w-0 flex-1">
                            {/* NOTE: Removed overflow-hidden from parent containers to allow dropdown to show fully */}
                            <div className="flex items-center gap-2 flex-1 min-w-0 relative" ref={contextDropdownRef}>
                                <span className="font-sans text-xs font-bold text-gray-400 uppercase tracking-wide flex-shrink-0 hidden sm:inline">Context:</span>
                                
                                <button 
                                    onClick={() => {
                                        // Initialize temp context state when opening
                                        if (!isContextDropdownOpen) {
                                            setTempContext(currentSession?.audience || []);
                                        }
                                        setIsContextDropdownOpen(!isContextDropdownOpen);
                                    }}
                                    className="flex gap-1 overflow-x-auto no-scrollbar items-center hover:bg-gray-100 p-1 rounded-lg transition-colors border border-transparent hover:border-gray-200 group"
                                    title="Switch Region"
                                >
                                    {currentSession?.audience.map((a, i) => (
                                        <span key={i} className="px-2 py-0.5 bg-excali-purpleLight/30 text-excali-purple rounded text-xs font-bold border border-excali-purple/20 whitespace-nowrap">
                                            {a}
                                        </span>
                                    ))}
                                    <Edit size={12} className="text-gray-300 ml-1 flex-shrink-0 group-hover:text-gray-500" />
                                </button>

                                {/* Interactive Dropdown */}
                                {isContextDropdownOpen && (
                                    <div className="absolute top-full left-0 mt-2 w-72 bg-white border border-gray-200 rounded-xl shadow-xl p-3 z-50 animate-in fade-in zoom-in-95 duration-200">
                                        <div className="flex justify-between items-center mb-2 px-1">
                                            <div className="text-xs font-bold text-gray-400 uppercase">Switch Region</div>
                                            <button onClick={() => setIsContextDropdownOpen(false)}><X size={14} className="text-gray-400 hover:text-gray-600"/></button>
                                        </div>
                                        <div className="space-y-1 max-h-[300px] overflow-y-auto custom-scrollbar mb-3">
                                            {AUDIENCE_GROUPS.map(group => {
                                                const isSelected = tempContext.includes(group.label);
                                                return (
                                                    <button
                                                        key={group.label}
                                                        onClick={() => toggleTempContext(group.label)}
                                                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left text-sm ${isSelected ? 'bg-excali-purpleLight/20 text-excali-purple' : 'hover:bg-gray-50 text-gray-600'}`}
                                                    >
                                                        <div className={`transition-transform ${isSelected ? 'scale-110' : 'opacity-30'}`}>
                                                            {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                                                        </div>
                                                        <span className="font-bold">{group.label}</span>
                                                    </button>
                                                )
                                            })}
                                        </div>
                                        <button 
                                            onClick={applyContextChange}
                                            disabled={tempContext.length === 0}
                                            className="w-full bg-excali-purple text-white rounded-lg py-2.5 text-xs font-bold hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            Update Context
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="h-6 w-px bg-gray-200 flex-shrink-0"></div>
                            {/* Knowledge Base Toggle */}
                            <button 
                                onClick={() => setShowKnowledge(!showKnowledge)}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex-shrink-0 ${showKnowledge ? 'bg-excali-purple text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                title="Knowledge Base"
                            >
                                <Library size={14} />
                                <span className="hidden md:inline">Knowledge Base</span>
                                {knowledgeFiles.length > 0 && (
                                    <span className={`ml-1 px-1.5 rounded-full text-[10px] ${showKnowledge ? 'bg-white text-excali-purple' : 'bg-gray-300 text-white'}`}>
                                        {knowledgeFiles.length}
                                    </span>
                                )}
                            </button>
                         </div>
                         
                         <div className="flex bg-gray-100 p-1 rounded-lg flex-shrink-0 ml-2">
                            <button 
                                onClick={() => handleLevelChange(ConsultantLevel.FAST)}
                                className={`flex items-center gap-1 px-2 md:px-3 py-1.5 text-xs font-bold rounded-md transition-all ${currentSession?.level === ConsultantLevel.FAST ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                title="Fast Mode: Extremely concise, practical colors & icons"
                            >
                                <Zap size={12} className={currentSession?.level === ConsultantLevel.FAST ? "text-yellow-500 fill-yellow-500" : ""} /> 
                                <span className="hidden md:inline">Fast Mode</span>
                            </button>
                            <button 
                                onClick={() => handleLevelChange(ConsultantLevel.DEEP)}
                                className={`flex items-center gap-1 px-2 md:px-3 py-1.5 text-xs font-bold rounded-md transition-all ${currentSession?.level === ConsultantLevel.DEEP ? 'bg-white text-excali-purple shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                title="Deep Mode: Historical context, deep meanings, and metaphors"
                            >
                                <BookOpen size={12} />
                                <span className="hidden md:inline">Deep Mode</span>
                            </button>
                         </div>
                    </div>

                    {/* REUSABLE KNOWLEDGE DRAWER */}
                    <KnowledgeDrawer 
                        isOpen={showKnowledge}
                        onClose={() => setShowKnowledge(false)}
                        files={knowledgeFiles}
                        onUpload={onUploadKnowledge}
                        onAddLink={onAddLink}
                        onRemove={onRemoveKnowledge}
                        isUploading={isUploadingKnowledge}
                        description="Global Knowledge Base: These files are shared across both the Audit and Consultant features."
                    />

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth w-full" ref={scrollRef}>
                        {currentSession?.messages.map((msg, idx) => (
                            <div key={idx} className={`flex items-start gap-3 md:gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''} animate-in fade-in slide-in-from-bottom-2 duration-300 max-w-full`}>
                                
                                {/* Avatar */}
                                <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm ${msg.role === 'user' ? 'bg-gray-800 text-white' : 'bg-white text-excali-purple border border-gray-200'}`}>
                                    {msg.role === 'user' ? <User size={18} /> : <Bot size={18} />}
                                </div>

                                {/* Message Content */}
                                <div className={`flex flex-col min-w-0 max-w-[85%] md:max-w-[75%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                    
                                    {/* 1. The Summary Paragraph */}
                                    {msg.text && (
                                        <div className={`p-4 rounded-2xl shadow-sm text-sm w-full break-words ${
                                            msg.role === 'user' 
                                            ? 'bg-gray-800 text-white rounded-tr-none' 
                                            : 'bg-white text-gray-800 border border-gray-200 rounded-tl-none'
                                        }`}>
                                            {msg.role === 'model' ? (
                                                <MarkdownRenderer content={msg.text} />
                                            ) : (
                                                <p className="whitespace-pre-wrap font-sans">{msg.text}</p>
                                            )}

                                            {/* SOURCE FOOTER (Only for Model) */}
                                            {msg.role === 'model' && (
                                                <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap gap-2">
                                                    
                                                    {/* A. Knowledge Base Citations */}
                                                    {msg.citedSources && msg.citedSources.length > 0 && (
                                                        <div className="flex flex-wrap gap-2 items-center w-full mb-1">
                                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                                                <FileText size={10} /> Knowledge Base:
                                                            </span>
                                                            {msg.citedSources.map((source, sIdx) => (
                                                                <span key={sIdx} className="px-2 py-1 bg-excali-purpleLight/20 text-excali-purple rounded text-[10px] font-bold border border-excali-purple/10">
                                                                    {source}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {/* B. Google Search Grounding */}
                                                    {msg.groundingMetadata?.groundingChunks && (
                                                         <div className="flex flex-wrap gap-2 items-center w-full">
                                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                                                <Search size={10} /> Web Sources:
                                                            </span>
                                                            {msg.groundingMetadata.groundingChunks.map((chunk: any, cIdx: number) => {
                                                                if (chunk.web?.uri) {
                                                                    return (
                                                                        <a 
                                                                            key={cIdx} 
                                                                            href={chunk.web.uri} 
                                                                            target="_blank" 
                                                                            rel="noreferrer"
                                                                            className="px-2 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded text-[10px] font-bold border border-blue-100 flex items-center gap-1 transition-colors"
                                                                        >
                                                                            {chunk.web.title || "Source"} <ExternalLink size={8} />
                                                                        </a>
                                                                    )
                                                                }
                                                                return null;
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* 2. The Mood Cards (If Any) */}
                                    {msg.moodCards && msg.moodCards.length > 0 && (
                                        <div className="mt-3 w-full overflow-x-auto pb-4 pl-4 pr-4 snap-x custom-scrollbar flex gap-4">
                                            {msg.moodCards.map((card, cIdx) => (
                                                <MoodCard key={cIdx} data={card} settings={settings} />
                                            ))}
                                            <div className="w-16 flex-shrink-0"></div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        
                        {loading && (
                            <div className="flex items-start gap-4 animate-pulse">
                                <div className="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center">
                                    <Bot size={20} className="text-gray-300" />
                                </div>
                                <div className="bg-white border border-gray-200 px-4 py-3 rounded-2xl rounded-tl-none text-gray-400 text-sm font-hand">
                                    <div className="flex items-center gap-2">
                                        <span>Thinking...</span>
                                        {knowledgeFiles.length > 0 && (
                                            <span className="text-xs text-excali-purple flex items-center gap-1">
                                                <Library size={10} /> checking files
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                        <div className="h-4" /> {/* Spacer */}
                    </div>

                    {/* Input Area */}
                    <div className="p-4 bg-white border-t border-gray-200">
                        <div className="relative max-w-4xl mx-auto">
                             {/* Image Preview */}
                            {chatImagePreview && (
                                <div className="mb-2 inline-block relative group">
                                    <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200">
                                        <img src={chatImagePreview} alt="Preview" className="w-full h-full object-cover" />
                                    </div>
                                    <button 
                                        onClick={clearChatImage}
                                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors"
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                            )}
                            
                            <div className="flex items-end gap-2 w-full">
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="p-4 bg-gray-100 text-gray-500 rounded-xl hover:bg-gray-200 hover:text-gray-700 transition-all flex-shrink-0 h-[56px] flex items-center justify-center"
                                    title="Upload Image"
                                    disabled={loading} // Keep disabling image upload during generation
                                >
                                    <ImageIcon size={20} />
                                </button>
                                <input 
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleImageSelect}
                                    className="hidden"
                                    accept="image/*"
                                />
                                
                                <div className="relative flex-1">
                                    <textarea
                                        ref={textareaRef}
                                        value={inputValue}
                                        onChange={(e) => setInputValue(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        placeholder={knowledgeFiles.length ? "Ask about your documents or cultural topics..." : "Ask about colors, symbols, or history..."}
                                        // Removed disabled={loading} to allow typing
                                        rows={1}
                                        className="w-full pl-5 pr-14 py-4 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-excali-purple/20 focus:border-excali-purple transition-all font-sans text-gray-700 shadow-inner resize-none overflow-y-auto min-h-[56px] max-h-32 leading-relaxed"
                                    />
                                    <button
                                        onClick={handleSend}
                                        disabled={(!inputValue.trim() && !chatImage) || loading}
                                        className="absolute right-2 bottom-2 p-2 bg-excali-purple text-white rounded-lg hover:shadow-lg disabled:opacity-50 disabled:shadow-none transition-all active:scale-95 flex items-center justify-center h-10 w-10"
                                    >
                                        <Send size={20} />
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className="text-center mt-2 hidden sm:block">
                             <p className="text-[10px] text-gray-400 font-sans">
                                AI uses {knowledgeFiles.length ? 'Uploaded Docs & ' : ''} Google Search. Verify independently.
                             </p>
                        </div>
                    </div>
                </>
            )}
        </div>
    </div>
  );
};

export default ConsultantView;
