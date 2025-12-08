
import React, { useState, useEffect } from 'react';
import { AppMode, AppSettings, AVAILABLE_MODELS, DEFAULT_SETTINGS, KnowledgeFile, DEFAULT_AUDIT_PROMPT, DEFAULT_CONSULTANT_PROMPT } from './types';
import AuditView from './components/AuditView';
import ConsultantView from './components/ConsultantView';
import { uploadKnowledgeFile, testApiConnection } from './services/geminiService';
import { LayoutTemplate, MessageSquareText, Settings as SettingsIcon, X, Key, Cpu, Image as ImageIcon, Save, Activity, Check, Loader2, FileCode, RotateCcw, Link as LinkIcon } from 'lucide-react';

function App() {
  const [mode, setMode] = useState<AppMode>(AppMode.AUDIT);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [hasKey, setHasKey] = useState(false);

  // Global Knowledge Base State
  const [knowledgeFiles, setKnowledgeFiles] = useState<KnowledgeFile[]>([]);
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  // Load Settings & Knowledge Base on Mount
  useEffect(() => {
    const initAuth = async () => {
        const savedSettings = localStorage.getItem('cultural_agent_settings');
        if (savedSettings) {
          try {
            const parsed = JSON.parse(savedSettings);
            const mergedSettings = { ...DEFAULT_SETTINGS, ...parsed };
            setSettings(mergedSettings);
            if (mergedSettings.apiKey) {
                setHasKey(true);
            }
          } catch (e) { console.error("Failed to load settings"); }
        }

        // Check environment key logic
        if (window.aistudio && window.aistudio.hasSelectedApiKey) {
            const hasEnvKey = await window.aistudio.hasSelectedApiKey();
            if (hasEnvKey) {
                setHasKey(true);
            }
        }
    };
    initAuth();

    const savedFiles = localStorage.getItem('cultural_agent_knowledge');
    if (savedFiles) {
        try {
            setKnowledgeFiles(JSON.parse(savedFiles));
        } catch (e) { console.error("Failed to load knowledge base"); }
    }
  }, []);

  // Save Knowledge Base Changes
  useEffect(() => {
      localStorage.setItem('cultural_agent_knowledge', JSON.stringify(knowledgeFiles));
  }, [knowledgeFiles]);

  const saveSettings = (newSettings: AppSettings) => {
      setSettings(newSettings);
      localStorage.setItem('cultural_agent_settings', JSON.stringify(newSettings));
      if (newSettings.apiKey) setHasKey(true);
  };

  const handleStart = (key: string) => {
      if (!key.trim()) return;
      const newSettings = { ...settings, apiKey: key.trim() };
      saveSettings(newSettings);
  };

  const handleConnectGoogle = async () => {
      if (window.aistudio && window.aistudio.openSelectKey) {
          await window.aistudio.openSelectKey();
          // Assume success if we return
          setHasKey(true);
          // Clear manual key so UI reflects that we are using the account key
          const newSettings = { ...settings, apiKey: '' };
          saveSettings(newSettings);
      } else {
          alert("This feature is only available in the AI Studio environment.");
      }
  };

  // Shared Knowledge Base Handlers
  const handleGlobalUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || !e.target.files[0]) return;
      const file = e.target.files[0];
      
      const newFile: KnowledgeFile = {
          id: Date.now().toString(),
          name: file.name,
          mimeType: file.type, // Initial value, will be updated by service response
          sourceType: 'FILE',
          status: 'UPLOADING'
      };
      
      setKnowledgeFiles(prev => [...prev, newFile]);
      setIsUploadingFile(true);

      try {
          // Destructure mimeType from response to ensure we have the correct API-compatible type
          const { uri, mimeType } = await uploadKnowledgeFile(file, settings.apiKey);
          setKnowledgeFiles(prev => prev.map(f => f.id === newFile.id ? { ...f, status: 'READY', uri, mimeType } : f));
      } catch (error) {
          setKnowledgeFiles(prev => prev.map(f => f.id === newFile.id ? { ...f, status: 'ERROR' } : f));
          alert("Failed to upload knowledge file. Please check permissions and API key.");
      } finally {
          setIsUploadingFile(false);
      }
  };

  const handleGlobalAddLink = (url: string) => {
      const newLink: KnowledgeFile = {
          id: Date.now().toString(),
          name: url,
          sourceType: 'LINK',
          status: 'READY'
      };
      setKnowledgeFiles(prev => [...prev, newLink]);
  };

  const handleGlobalRemoveFile = (id: string) => {
      setKnowledgeFiles(prev => prev.filter(f => f.id !== id));
  };

  const SettingsModal = () => {
    const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
    const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
    const [activeTab, setActiveTab] = useState<'GENERAL' | 'PROMPTS'>('GENERAL');

    const runConnectionTest = async () => {
        setConnectionStatus('testing');
        const success = await testApiConnection(localSettings.apiKey);
        setConnectionStatus(success ? 'success' : 'error');
        setTimeout(() => setConnectionStatus('idle'), 4000);
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-0 border border-gray-200 overflow-hidden flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gray-50">
                    <h2 className="font-hand text-2xl font-bold flex items-center gap-2 text-gray-800">
                        <SettingsIcon size={24} className="text-gray-500" /> Settings
                    </h2>
                    <button onClick={() => setIsSettingsOpen(false)} className="p-1 hover:bg-gray-200 rounded-full transition-colors">
                        <X size={20} className="text-gray-500"/>
                    </button>
                </div>
                
                {/* Tabs */}
                <div className="flex border-b border-gray-200">
                    <button 
                        onClick={() => setActiveTab('GENERAL')} 
                        className={`flex-1 py-3 text-xs font-bold uppercase tracking-wide transition-colors ${activeTab === 'GENERAL' ? 'bg-white text-excali-purple border-b-2 border-excali-purple' : 'bg-gray-50 text-gray-500 hover:text-gray-700'}`}
                    >
                        Models & API
                    </button>
                    <button 
                         onClick={() => setActiveTab('PROMPTS')} 
                         className={`flex-1 py-3 text-xs font-bold uppercase tracking-wide transition-colors ${activeTab === 'PROMPTS' ? 'bg-white text-excali-purple border-b-2 border-excali-purple' : 'bg-gray-50 text-gray-500 hover:text-gray-700'}`}
                    >
                        System Prompts
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
                    
                    {activeTab === 'GENERAL' ? (
                        <>
                             {/* Auth Status */}
                            <div>
                                <label className="block text-xs font-bold uppercase text-gray-400 mb-1.5 flex items-center gap-1">
                                    <Key size={12}/> Gemini API Key
                                </label>
                                
                                <div className="space-y-3">
                                    {/* Option A: Manual */}
                                    <div className="flex gap-2">
                                        <input 
                                            type="password"
                                            className="flex-1 p-2 border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:border-excali-purple font-mono text-sm"
                                            placeholder="Paste AIza... key here"
                                            value={localSettings.apiKey}
                                            onChange={(e) => setLocalSettings({...localSettings, apiKey: e.target.value})}
                                        />
                                        <button 
                                            onClick={runConnectionTest}
                                            disabled={connectionStatus === 'testing' || !localSettings.apiKey}
                                            className={`px-3 py-2 rounded-lg border flex items-center gap-2 justify-center transition-all ${connectionStatus === 'success' ? 'bg-green-50 border-green-200 text-green-600' : connectionStatus === 'error' ? 'bg-red-50 border-red-200 text-red-600' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                                            title="Test Manual Key"
                                        >
                                            {connectionStatus === 'testing' ? <Loader2 size={16} className="animate-spin" /> : 
                                            connectionStatus === 'success' ? <Check size={16} /> : 
                                            connectionStatus === 'error' ? <X size={16} /> : 
                                            <Activity size={16} />}
                                        </button>
                                    </div>
                                    
                                    <div className="flex items-center gap-3">
                                        <div className="h-px bg-gray-200 flex-1"></div>
                                        <span className="text-xs text-gray-400 font-bold">OR</span>
                                        <div className="h-px bg-gray-200 flex-1"></div>
                                    </div>

                                    {/* Option B: Account Connect */}
                                    <button 
                                        onClick={handleConnectGoogle}
                                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg text-gray-700 text-sm font-medium transition-colors"
                                    >
                                        <LinkIcon size={16} />
                                        Connect Google Account (Recommended for Pro Models)
                                    </button>
                                </div>
                                <p className="text-[10px] text-gray-400 mt-2">Required for Gemini 3.0 Pro Image models.</p>
                            </div>

                            {/* General Model */}
                            <div>
                                <label className="block text-xs font-bold uppercase text-gray-400 mb-1.5 flex items-center gap-1">
                                    <Cpu size={12}/> General Model (Chat & Audit)
                                </label>
                                <div className="relative">
                                    <select 
                                        className="w-full p-3 border border-gray-200 rounded-lg bg-white appearance-none cursor-pointer hover:border-gray-300 focus:outline-none focus:border-excali-purple"
                                        value={localSettings.generalModel}
                                        onChange={e => setLocalSettings({...localSettings, generalModel: e.target.value})}
                                    >
                                        {AVAILABLE_MODELS.general.map(m => (
                                            <option key={m.id} value={m.id}>{m.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Image Model */}
                            <div>
                                <label className="block text-xs font-bold uppercase text-gray-400 mb-1.5 flex items-center gap-1">
                                    <ImageIcon size={12}/> Image Generation Model
                                </label>
                                <div className="relative">
                                    <select 
                                        className="w-full p-3 border border-gray-200 rounded-lg bg-white appearance-none cursor-pointer hover:border-gray-300 focus:outline-none focus:border-excali-purple"
                                        value={localSettings.imageModel}
                                        onChange={e => setLocalSettings({...localSettings, imageModel: e.target.value})}
                                    >
                                        {AVAILABLE_MODELS.image.map(m => (
                                            <option key={m.id} value={m.id}>{m.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </>
                    ) : (
                        /* PROMPTS TAB */
                        <div className="space-y-6">
                             <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-100 text-xs text-yellow-700">
                                <strong>Warning:</strong> Modifying system prompts can affect the quality and format of AI responses. Ensure you keep the JSON output structure intact.
                             </div>
                             
                             {/* Audit Prompt */}
                             <div>
                                <div className="flex justify-between items-end mb-1.5">
                                    <label className="text-xs font-bold uppercase text-gray-400 flex items-center gap-1">
                                        <FileCode size={12}/> Audit System Prompt
                                    </label>
                                    <button 
                                        onClick={() => setLocalSettings(prev => ({...prev, auditSystemPrompt: DEFAULT_AUDIT_PROMPT}))}
                                        className="text-[10px] text-gray-400 hover:text-excali-purple flex items-center gap-1"
                                        title="Reset to Default"
                                    >
                                        <RotateCcw size={10} /> Reset
                                    </button>
                                </div>
                                <textarea 
                                    className="w-full p-3 border border-gray-200 rounded-lg bg-gray-50 font-mono text-xs h-40 focus:outline-none focus:border-excali-purple focus:ring-2 focus:ring-excali-purple/20 transition-all resize-y"
                                    value={localSettings.auditSystemPrompt}
                                    onChange={e => setLocalSettings({...localSettings, auditSystemPrompt: e.target.value})}
                                />
                                <div className="text-[10px] text-gray-400 mt-1">
                                    Required variables: <span className="font-mono bg-gray-100 px-1 rounded text-gray-600">{`{{regions}}`}</span>, <span className="font-mono bg-gray-100 px-1 rounded text-gray-600">{`{{ragInstructions}}`}</span>
                                </div>
                             </div>

                             {/* Consultant Prompt */}
                             <div>
                                <div className="flex justify-between items-end mb-1.5">
                                    <label className="text-xs font-bold uppercase text-gray-400 flex items-center gap-1">
                                        <FileCode size={12}/> Consultant System Prompt
                                    </label>
                                    <button 
                                        onClick={() => setLocalSettings(prev => ({...prev, consultantSystemPrompt: DEFAULT_CONSULTANT_PROMPT}))}
                                        className="text-[10px] text-gray-400 hover:text-excali-purple flex items-center gap-1"
                                        title="Reset to Default"
                                    >
                                        <RotateCcw size={10} /> Reset
                                    </button>
                                </div>
                                <textarea 
                                    className="w-full p-3 border border-gray-200 rounded-lg bg-gray-50 font-mono text-xs h-40 focus:outline-none focus:border-excali-purple focus:ring-2 focus:ring-excali-purple/20 transition-all resize-y"
                                    value={localSettings.consultantSystemPrompt}
                                    onChange={e => setLocalSettings({...localSettings, consultantSystemPrompt: e.target.value})}
                                />
                                <div className="text-[10px] text-gray-400 mt-1">
                                     Required variables: <span className="font-mono bg-gray-100 px-1 rounded text-gray-600">{`{{audience}}`}</span>, <span className="font-mono bg-gray-100 px-1 rounded text-gray-600">{`{{modeInstructions}}`}</span>, <span className="font-mono bg-gray-100 px-1 rounded text-gray-600">{`{{ragInstructions}}`}</span>
                                </div>
                             </div>
                        </div>
                    )}

                </div>

                <div className="p-6 border-t border-gray-100 flex justify-end bg-gray-50">
                    <button 
                        onClick={() => {
                            saveSettings(localSettings);
                            setIsSettingsOpen(false);
                        }}
                        className="bg-excali-purple text-white px-6 py-2.5 rounded-xl font-hand font-bold text-lg hover:shadow-sketch transition-all flex items-center gap-2"
                    >
                        <Save size={18} /> Save Changes
                    </button>
                </div>
            </div>
        </div>
    );
  };

  const WelcomeScreen = () => {
    const [inputKey, setInputKey] = useState('');
    
    return (
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-dots p-6">
             <div className="bg-white p-8 rounded-2xl shadow-sketch border border-gray-200 max-w-md w-full animate-in zoom-in-95 duration-300">
                <div className="w-16 h-16 bg-excali-purpleLight text-excali-purple rounded-full flex items-center justify-center mx-auto mb-6">
                    <CulturalLogo className="w-10 h-10 text-excali-purple" />
                </div>
                <h1 className="font-hand text-3xl font-bold text-gray-800 mb-3 text-center">Welcome</h1>
                <p className="font-sans text-gray-500 mb-6 leading-relaxed text-center text-sm">
                  To use the advanced cultural intelligence models, please authorize access.
                </p>
                
                <div className="space-y-4">
                     {/* Manual */}
                    <div>
                        <input 
                            type="password" 
                            placeholder="Option 1: Paste Manual API Key"
                            className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:border-excali-purple focus:ring-2 focus:ring-excali-purple/20 transition-all font-mono text-sm"
                            value={inputKey}
                            onChange={(e) => setInputKey(e.target.value)}
                        />
                    </div>
                    
                    <button 
                        onClick={() => handleStart(inputKey)}
                        disabled={!inputKey.trim()}
                        className="w-full bg-excali-purple text-white font-hand font-bold text-lg py-3 rounded-xl shadow-sketch hover:shadow-sketch-hover hover:-translate-y-1 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                    >
                        Use Manual Key
                    </button>

                    <div className="flex items-center gap-3">
                        <div className="h-px bg-gray-200 flex-1"></div>
                        <span className="text-xs text-gray-400 font-bold">OR</span>
                        <div className="h-px bg-gray-200 flex-1"></div>
                    </div>

                    {/* Google Connect */}
                    <button 
                        onClick={handleConnectGoogle}
                        className="w-full bg-white text-gray-700 border border-gray-200 font-hand font-bold text-lg py-3 rounded-xl hover:bg-gray-50 transition-all flex items-center justify-center gap-2"
                    >
                         <LinkIcon size={18} /> Connect Google Account
                    </button>
                    <p className="text-[10px] text-gray-400 text-center">Recommended for access to Gemini 3.0 Pro Image.</p>
                </div>
                
                <div className="mt-4 text-center">
                    <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-xs text-gray-400 underline hover:text-excali-purple">
                        Get an API Key
                    </a>
                </div>
             </div>
        </div>
    );
  };

  if (!hasKey) {
      return <WelcomeScreen />;
  }

  return (
    <div className="h-screen w-screen flex bg-dots text-excali-stroke overflow-hidden">
      
      {/* Settings Modal */}
      {isSettingsOpen && <SettingsModal />}

      {/* Left Navigation Sidebar */}
      <aside className="w-20 h-full bg-white border-r border-gray-200 flex flex-col items-center py-6 z-50 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        {/* Logo */}
        <div className="w-12 h-12 flex items-center justify-center mb-8 transition-transform hover:scale-105 cursor-default">
           <CulturalLogo className="w-full h-full text-excali-purple" />
        </div>

        {/* Nav Items */}
        <nav className="flex flex-col gap-6 w-full items-center">
          <NavIcon 
            icon={<LayoutTemplate size={24} />} 
            label="Cultural Audit" 
            isActive={mode === AppMode.AUDIT} 
            onClick={() => setMode(AppMode.AUDIT)} 
          />
          <NavIcon 
            icon={<MessageSquareText size={24} />} 
            label="Cultural Consultant" 
            isActive={mode === AppMode.CONSULTANT} 
            onClick={() => setMode(AppMode.CONSULTANT)} 
          />
        </nav>

        {/* Settings Button */}
        <div className="mt-auto pb-6">
             <button 
                onClick={() => setIsSettingsOpen(true)}
                className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                title="Settings"
             >
                 <SettingsIcon size={20} />
             </button>
             <div className="text-[10px] font-sans text-gray-300 text-center mt-2">v3.9</div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 h-full relative overflow-hidden bg-dots">
          <div className={`w-full h-full ${mode === AppMode.AUDIT ? 'block' : 'hidden'}`}>
            <AuditView 
                settings={settings}
                knowledgeFiles={knowledgeFiles}
                onUploadKnowledge={handleGlobalUpload}
                onAddLink={handleGlobalAddLink}
                onRemoveKnowledge={handleGlobalRemoveFile}
                isUploadingKnowledge={isUploadingFile}
            />
          </div>
          <div className={`w-full h-full ${mode === AppMode.CONSULTANT ? 'block' : 'hidden'}`}>
            <ConsultantView 
                settings={settings}
                knowledgeFiles={knowledgeFiles}
                onUploadKnowledge={handleGlobalUpload}
                onAddLink={handleGlobalAddLink}
                onRemoveKnowledge={handleGlobalRemoveFile}
                isUploadingKnowledge={isUploadingFile}
            />
          </div>
      </main>
    </div>
  );
}

// Custom Logo Component - Celtic Knot / Rosette Style
const CulturalLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <g transform="translate(50, 50)">
       {/* Weave Effect: Overlapping ellipses with white borders to simulate interlacing */}
       {[0, 45, 90, 135].map((angle) => (
         <g key={angle} transform={`rotate(${angle})`}>
            {/* Masking stroke (Background) */}
            <ellipse 
                cx="0" cy="0" rx="16" ry="35" 
                stroke="white" strokeWidth="8"
            />
            {/* Actual stroke (Foreground) */}
            <ellipse 
                cx="0" cy="0" rx="16" ry="35" 
                stroke="currentColor" strokeWidth="3.5"
            />
         </g>
       ))}
       
       {/* Decorative Dots in the loops */}
       {[0, 45, 90, 135, 180, 225, 270, 315].map(angle => {
          const rad = (angle * Math.PI) / 180;
          const r = 28; 
          const cx = Math.sin(rad) * r;
          const cy = -Math.cos(rad) * r;
          return (
            <circle 
              key={`dot-${angle}`} 
              cx={cx} cy={cy} r="3.5" 
              fill="currentColor" 
              stroke="white" 
              strokeWidth="1.5" 
            />
          );
       })}
    </g>
  </svg>
)

// Helper Component for Nav Icons with Tooltips
const NavIcon = ({ icon, label, isActive, onClick }: { icon: React.ReactNode, label: string, isActive: boolean, onClick: () => void }) => {
  return (
    <button 
      onClick={onClick}
      className={`
        group relative flex items-center justify-center w-12 h-12 rounded-xl transition-all duration-200
        ${isActive 
          ? 'bg-excali-purpleLight text-excali-purple shadow-inner' 
          : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
        }
      `}
    >
      {icon}
      
      {/* Tooltip */}
      <div className="absolute left-full ml-4 px-3 py-1.5 bg-gray-800 text-white text-xs font-sans rounded-md opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-xl">
        {label}
        {/* Arrow */}
        <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-2 bg-gray-800 rotate-45"></div>
      </div>
    </button>
  )
}

export default App;
