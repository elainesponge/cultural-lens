
import React, { useState, useRef, useEffect } from 'react';
import { AuditResult, Sentiment, AuditSession, AUDIENCE_GROUPS, AppSettings, KnowledgeFile } from '../types';
import { performCulturalAudit, generateAlternativeImage, processImageForGemini } from '../services/geminiService';
import ImageAnnotator from './ImageAnnotator';
import KnowledgeDrawer from './KnowledgeDrawer';
import { Upload, Loader2, AlertTriangle, CheckCircle, Sparkles, Eraser, Globe, ChevronDown, Check, ArrowRight, Square, CheckSquare, Clock, X, Trash2, Library, PanelRight, Plus } from 'lucide-react';

interface AuditViewProps {
  settings: AppSettings;
  knowledgeFiles: KnowledgeFile[];
  onUploadKnowledge: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAddLink: (url: string) => void;
  onRemoveKnowledge: (id: string) => void;
  isUploadingKnowledge: boolean;
}

const AuditView: React.FC<AuditViewProps> = ({ 
    settings, 
    knowledgeFiles, 
    onUploadKnowledge,
    onAddLink,
    onRemoveKnowledge, 
    isUploadingKnowledge 
}) => {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  // Multi-select Region State
  const [selectedRegions, setSelectedRegions] = useState<string[]>(["US"]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Knowledge Base UI State (Global Data from Props)
  const [showKnowledge, setShowKnowledge] = useState(false);

  // Mobile Results Toggle
  const [showMobileResults, setShowMobileResults] = useState(false);

  // Generation State
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [generatedAlternatives, setGeneratedAlternatives] = useState<Record<string, string>>({});

  // History State
  const [showHistory, setShowHistory] = useState(false);
  const [auditHistory, setAuditHistory] = useState<AuditSession[]>([]);

  // Load History on Mount
  useEffect(() => {
    const saved = localStorage.getItem('cultural_audit_history');
    if (saved) {
        try {
            setAuditHistory(JSON.parse(saved));
        } catch (e) { console.error("Failed to load history"); }
    }
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const processUploadedFile = async (file: File) => {
    setImageFile(file);
    try {
        // Optimize Image (Resize + Compress)
        const { base64, mimeType } = await processImageForGemini(file);
        // Store optimized version
        setImageBase64(`data:${mimeType};base64,${base64}`);
        setResult(null);
        setGeneratedAlternatives({});
    } catch (err) {
        alert("Failed to process image. It might be corrupted or too large.");
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processUploadedFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          processUploadedFile(e.dataTransfer.files[0]);
      }
  };

  const saveToHistory = (newResult: AuditResult, imgBase64: string, regions: string[]) => {
      const newSession: AuditSession = {
          id: Date.now().toString(),
          timestamp: Date.now(),
          imageThumbnail: imgBase64, // Storing full base64 as thumbnail for simplicity in this demo
          fullImage: imgBase64,
          regions: regions,
          result: newResult
      };
      
      const updatedHistory = [newSession, ...auditHistory].slice(0, 10); // Limit to 10
      setAuditHistory(updatedHistory);
      localStorage.setItem('cultural_audit_history', JSON.stringify(updatedHistory));
  };

  const restoreSession = (session: AuditSession) => {
      setImageBase64(session.fullImage);
      setResult(session.result);
      setSelectedRegions(session.regions);
      setShowHistory(false);
      // Reset generative state for new session view
      setGeneratedAlternatives({});
      setSelectedId(null);
  };

  const deleteHistoryItem = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      const updated = auditHistory.filter(h => h.id !== id);
      setAuditHistory(updated);
      localStorage.setItem('cultural_audit_history', JSON.stringify(updated));
  };

  const clearHistory = () => {
      setAuditHistory([]);
      localStorage.removeItem('cultural_audit_history');
  };

  const handleReset = () => {
    setImageBase64(null);
    setImageFile(null);
    setResult(null);
    setGeneratedAlternatives({});
    setSelectedId(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const runAudit = async () => {
    if (!imageBase64) return;
    setIsAnalyzing(true);
    // Auto-open results panel on mobile when starting
    setShowMobileResults(true); 
    try {
      const cleanBase64 = imageBase64.split(',')[1];
      const contextRegions = selectedRegions.flatMap(label => {
         const group = AUDIENCE_GROUPS.find(g => g.label === label);
         return group ? group.value : [label];
      });

      // Pass Knowledge Files to Service
      const data = await performCulturalAudit(
          cleanBase64, 
          contextRegions, 
          knowledgeFiles, // Use global files
          settings.apiKey, 
          settings.generalModel,
          settings.auditSystemPrompt // Pass custom prompt
      );
      
      setResult(data);
      // Previously auto-selected first item here. Removed to default to List View.
      // if (data.annotations && data.annotations.length > 0) { setSelectedId(data.annotations[0].id); }
      
      // Save success to history
      saveToHistory(data, imageBase64, selectedRegions);

    } catch (e: any) {
      alert(`Analysis Failed: ${e.message || "Unknown error"}. Check API key or try a different image.`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerateFix = async (annotationId: string, prompt: string) => {
    setGeneratingId(annotationId);
    try {
      const newImageUrl = await generateAlternativeImage(prompt, settings.apiKey, settings.imageModel);
      setGeneratedAlternatives(prev => ({ ...prev, [annotationId]: newImageUrl }));
    } catch (e) {
      alert("Failed to generate alternative.");
    } finally {
      setGeneratingId(null);
    }
  };

  const toggleRegion = (label: string) => {
    if (selectedRegions.includes(label)) {
      setSelectedRegions(prev => prev.filter(r => r !== label));
    } else {
      setSelectedRegions(prev => [...prev, label]);
    }
  };

  // FIX: Added optional chaining to handle missing annotations safely
  const selectedAnnotation = result?.annotations?.find(a => a.id === selectedId);

  return (
    <div className="flex h-full w-full flex-row bg-white overflow-hidden relative">
      
      {/* HISTORY DRAWER */}
      {showHistory && (
          <div className="absolute inset-0 z-50 flex">
             <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowHistory(false)}></div>
             <div className="relative w-80 bg-white shadow-2xl h-full flex flex-col animate-in slide-in-from-left duration-200">
                <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-hand font-bold text-xl flex items-center gap-2">
                        <Clock size={20} className="text-gray-500" /> History
                    </h3>
                    <button onClick={() => setShowHistory(false)} className="p-1 hover:bg-gray-100 rounded-md">
                        <X size={20} className="text-gray-500" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {auditHistory.length === 0 && (
                        <div className="text-center text-gray-400 font-hand py-10">No recent scans</div>
                    )}
                    {auditHistory.map(session => (
                        <div 
                            key={session.id} 
                            onClick={() => restoreSession(session)}
                            className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-excali-purple cursor-pointer hover:bg-gray-50 transition-all group relative"
                        >
                            <img src={session.imageThumbnail} alt="Thumb" className="w-12 h-12 rounded object-cover border border-gray-100 bg-gray-100 flex-shrink-0" />
                            <div className="overflow-hidden flex-1 min-w-0 pr-6">
                                <div className="text-xs text-gray-400 font-bold mb-0.5">
                                    {new Date(session.timestamp).toLocaleDateString()}
                                </div>
                                <div className="text-sm font-hand font-bold truncate text-gray-700">
                                    {session.regions.join(", ")}
                                </div>
                                <div className="text-[10px] text-gray-400">
                                    {session.result.annotations?.length || 0} findings
                                </div>
                            </div>
                            <button 
                                onClick={(e) => deleteHistoryItem(e, session.id)}
                                className="absolute right-2 top-2 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                title="Delete Scan"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    ))}
                </div>
                {auditHistory.length > 0 && (
                    <div className="p-4 border-t border-gray-100">
                        <button onClick={clearHistory} className="w-full flex items-center justify-center gap-2 text-red-500 hover:bg-red-50 p-2 rounded-lg text-sm font-bold transition-colors">
                            <Trash2 size={16} /> Clear All History
                        </button>
                    </div>
                )}
             </div>
          </div>
      )}

      {/* KNOWLEDGE DRAWER */}
      <KnowledgeDrawer 
        isOpen={showKnowledge}
        onClose={() => setShowKnowledge(false)}
        files={knowledgeFiles}
        onUpload={onUploadKnowledge}
        onAddLink={onAddLink}
        onRemove={onRemoveKnowledge}
        isUploading={isUploadingKnowledge}
        description="Global Knowledge Base: Upload brand guidelines or compliance PDFs to check designs against specific rules."
      />

      {/* LEFT COLUMN: Audience + Canvas */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* SECTION 1: Audience Bar */}
        <div className="w-full border-b border-gray-200 bg-white p-3 md:p-4 flex items-center justify-between gap-2 z-30 shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
            <div className="flex items-center gap-2 md:gap-4 flex-1 min-w-0">
                 <button 
                    onClick={() => setShowHistory(true)}
                    className="p-2 text-gray-400 hover:text-excali-purple hover:bg-excali-purpleLight/20 rounded-lg transition-colors flex-shrink-0"
                    title="History"
                 >
                     <Clock size={20} />
                 </button>

                 <div className="h-6 w-px bg-gray-200 mx-1 flex-shrink-0"></div>

                 <div className="flex items-center gap-2 pr-2 md:pr-4 border-r border-gray-200 flex-shrink-0">
                    <Globe size={20} className="text-excali-purple" />
                    <span className="font-hand font-bold text-gray-700 text-xl tracking-wide hidden xl:inline">Target Audience</span>
                 </div>
                 
                 {/* Dropdown Trigger */}
                 <div className="relative flex-1 min-w-0 max-w-[350px]" ref={dropdownRef}>
                    <button 
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                        className="flex items-center gap-3 px-3 md:px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all w-full justify-between shadow-sm"
                    >
                        <div className="flex items-center gap-2 overflow-hidden">
                            <span className="font-hand font-bold text-lg text-gray-700 truncate">
                                {selectedRegions.length === 0 
                                    ? "Select Regions..." 
                                    : selectedRegions.length === 1 
                                        ? selectedRegions[0] 
                                        : `${selectedRegions.length} Regions`
                                }
                            </span>
                        </div>
                        <ChevronDown size={16} className={`text-gray-400 transition-transform flex-shrink-0 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Dropdown Menu */}
                    {isDropdownOpen && (
                        <div className="absolute top-full left-0 mt-2 w-full min-w-[250px] bg-white border border-gray-200 rounded-xl shadow-sketch-lg p-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                            <div className="space-y-1 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
                                {AUDIENCE_GROUPS.map(group => {
                                    const isSelected = selectedRegions.includes(group.label);
                                    return (
                                        <button
                                            key={group.label}
                                            onClick={() => toggleRegion(group.label)}
                                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left group ${isSelected ? 'bg-excali-purpleLight/20' : 'hover:bg-gray-50'}`}
                                        >
                                            <div className={`text-excali-purple transition-transform ${isSelected ? 'scale-110' : 'opacity-40 group-hover:opacity-70'}`}>
                                                {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                                            </div>
                                            <span className={`font-hand font-bold text-lg ${isSelected ? 'text-gray-800' : 'text-gray-500'}`}>
                                                {group.label}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                 </div>

                 {/* Knowledge Base Toggle */}
                 <button 
                    onClick={() => setShowKnowledge(!showKnowledge)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold transition-all ml-0 md:ml-2 flex-shrink-0 ${showKnowledge ? 'bg-excali-purple text-white shadow-md' : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200'}`}
                    title="Knowledge Base"
                >
                    <Library size={16} />
                    <span className="hidden lg:inline">Knowledge Base</span>
                    {knowledgeFiles.length > 0 && (
                        <span className={`ml-1 px-1.5 rounded-full text-[10px] ${showKnowledge ? 'bg-white text-excali-purple' : 'bg-gray-400 text-white'}`}>
                            {knowledgeFiles.length}
                        </span>
                    )}
                 </button>
            </div>

            <div className="flex items-center gap-2">
                {/* Mobile Results Toggle */}
                {result && (
                     <button 
                        onClick={() => setShowMobileResults(!showMobileResults)}
                        className={`lg:hidden p-2 rounded-lg transition-colors ${showMobileResults ? 'bg-excali-purple text-white' : 'bg-gray-50 text-gray-600 border border-gray-200'}`}
                        title="Toggle Findings"
                    >
                        <PanelRight size={20} />
                    </button>
                )}
                
                {/* Reset Button */}
                {imageBase64 && (
                    <button
                        onClick={handleReset}
                        className="flex-shrink-0 bg-white text-gray-500 hover:text-red-500 hover:bg-red-50 font-hand text-lg px-3 md:px-4 py-2 rounded-md border border-gray-200 hover:border-red-200 shadow-sm transition-all flex items-center gap-2 whitespace-nowrap"
                        title="Upload New Design"
                    >
                        <Eraser size={18} />
                        <span className="hidden md:inline">Reset</span>
                    </button>
                )}

                {/* Action Button */}
                {imageBase64 && (
                    <button 
                        onClick={runAudit}
                        disabled={isAnalyzing || selectedRegions.length === 0}
                        className="flex-shrink-0 bg-excali-purple text-white font-hand text-lg px-4 md:px-6 py-2 rounded-md shadow-sketch hover:shadow-sketch-hover hover:-translate-y-0.5 active:translate-y-0 active:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
                    >
                        {isAnalyzing ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
                        <span className="hidden md:inline">{isAnalyzing ? "Scanning..." : "Run Audit"}</span>
                        <span className="inline md:hidden">{isAnalyzing ? "..." : "Run"}</span>
                    </button>
                )}
            </div>
        </div>

        {/* SECTION 2: Upload / Canvas Area */}
        <div className="flex-1 relative bg-white flex items-center justify-center p-6 overflow-hidden">
            {!imageBase64 ? (
                <div 
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className="text-center p-8 flex flex-col items-center gap-4 group cursor-pointer border-4 border-dashed border-gray-200 rounded-2xl hover:bg-gray-50 hover:border-excali-purple/50 transition-all max-w-sm w-full animate-in zoom-in-95 duration-300"
                >
                    <input 
                        type="file" 
                        ref={fileInputRef}
                        className="hidden" 
                        accept="image/*"
                        onChange={handleFileChange}
                    />
                    
                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform border border-gray-100 pointer-events-none">
                        <Upload size={28} className="text-gray-400 group-hover:text-excali-purple" />
                    </div>
                    <div className="pointer-events-none">
                      <h3 className="font-hand text-2xl font-bold text-gray-700 mb-1">Upload Design</h3>
                      <p className="font-sans text-sm text-gray-400">Click or drag image here</p>
                    </div>
                </div>
            ) : (
                <div className="relative w-full h-full flex items-center justify-center">
                     {isAnalyzing && (
                        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm">
                            <div className="font-hand text-3xl animate-bounce text-excali-purple mb-2">Analyzing...</div>
                            <p className="font-sans text-gray-500">Consulting cultural database {knowledgeFiles.length > 0 ? `& ${knowledgeFiles.length} files` : ''}</p>
                        </div>
                     )}
                    
                    <ImageAnnotator 
                        imageUrl={imageBase64}
                        annotations={result?.annotations || []}
                        selectedAnnotationId={selectedId}
                        onSelectAnnotation={(id) => {
                            setSelectedId(id);
                            setShowMobileResults(true); // Open panel on selection
                        }}
                    />
                    
                    <div className="absolute top-0 right-0 z-20">
                         <button 
                            onClick={handleReset}
                            className="flex items-center gap-2 text-sm font-hand font-bold text-gray-400 hover:text-red-500 bg-white px-3 py-1.5 rounded-lg border border-gray-200 hover:border-red-200 transition-all shadow-sm"
                         >
                            <Eraser size={14} /> Reset
                         </button>
                    </div>
                </div>
            )}
        </div>
      </div>

      {/* SECTION 3: Results Area (Right Sidebar) */}
      {/* Visible on LG screens OR when toggled on mobile */}
      <div className={`
            w-[400px] flex-shrink-0 bg-white border-l border-gray-200 flex flex-col h-full z-20 shadow-[-2px_0_10px_rgba(0,0,0,0.02)]
            ${showMobileResults ? 'absolute inset-y-0 right-0 animate-in slide-in-from-right duration-300' : 'hidden lg:flex'}
      `}>
        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-white">
            <h2 className="font-hand text-2xl font-bold text-gray-800 flex items-center gap-2">
                Audit Findings
            </h2>
            <div className="flex items-center gap-2">
                {result && (
                <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2 py-1 rounded-md border border-gray-200">
                    {result.annotations?.length || 0} items
                </span>
                )}
                <button onClick={() => setShowMobileResults(false)} className="lg:hidden p-1 text-gray-400 hover:bg-gray-100 rounded">
                    <X size={20} />
                </button>
            </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {!result && !isAnalyzing && (
                <div className="flex flex-col items-center justify-center h-3/4 text-center opacity-40">
                   <div className="w-16 h-16 bg-gray-50 rounded-full mb-4 flex items-center justify-center border border-gray-100">
                        <ArrowRight className="text-gray-400" size={24}/>
                   </div>
                   <p className="font-hand text-xl text-gray-400 max-w-[200px]">Results will appear here after scanning.</p>
                </div>
            )}

            {/* Selected Annotation Detail */}
            {selectedAnnotation ? (
                <div className="animate-in slide-in-from-right-4 fade-in duration-300 space-y-6">
                    
                    <button onClick={() => setSelectedId(null)} className="mb-2 text-xs text-gray-400 font-bold flex items-center gap-1 hover:text-gray-600 uppercase tracking-wider">
                       ← Back to list
                    </button>

                    <div className={`rounded-xl border-2 p-6 bg-white relative transition-all ${selectedAnnotation.sentiment === Sentiment.RISK ? 'border-red-100 shadow-[4px_4px_0px_#fee2e2]' : 'border-green-100 shadow-[4px_4px_0px_#dcfce7]'}`}>
                        
                        <div className="flex items-center gap-2 mb-4">
                              <span className={`text-sm font-bold font-hand px-3 py-1 rounded-md flex items-center gap-1.5 border ${selectedAnnotation.sentiment === Sentiment.RISK ? 'bg-red-50 text-red-600 border-red-100' : 'bg-green-50 text-green-600 border-green-100'}`}>
                                  {selectedAnnotation.sentiment === Sentiment.RISK ? <AlertTriangle size={14} /> : <CheckCircle size={14} />}
                                  {selectedAnnotation.sentiment === Sentiment.RISK ? "Risk Detected" : "Resonates Well"}
                              </span>
                        </div>
                          
                        <h3 className="text-2xl font-hand font-bold mb-3 leading-tight text-gray-900">
                              {selectedAnnotation.label}
                        </h3>
                          
                        <p className="font-sans text-sm text-gray-600 leading-relaxed mb-6">
                              {selectedAnnotation.description}
                        </p>

                        {selectedAnnotation.sentiment === Sentiment.RISK && selectedAnnotation.suggestion && (
                            <div className="bg-gray-50/50 rounded-lg p-4 border border-gray-200 border-dashed relative group-fix">
                                <div className="absolute -top-3 left-4 bg-white px-2 text-[10px] font-bold text-gray-400 uppercase tracking-wide border border-gray-100 rounded">Suggestion</div>
                                
                                <div className="flex items-center gap-2 mb-2 text-excali-purple font-hand font-bold text-lg mt-1">
                                    <Sparkles size={16}/>
                                    <span>Fix Recommendation</span>
                                </div>
                                
                                <p className="text-sm italic text-gray-600 mb-4 pl-3 border-l-2 border-excali-purpleLight">"{selectedAnnotation.suggestion}"</p>
                                    
                                {generatedAlternatives[selectedAnnotation.id] ? (
                                        <div className="animate-in fade-in duration-500">
                                            <div className="rounded-lg overflow-hidden border border-gray-200 shadow-sm mb-3 bg-white p-2">
                                              <img 
                                                  src={generatedAlternatives[selectedAnnotation.id]} 
                                                  alt="Generated Alternative" 
                                                  className="w-full h-auto block rounded"
                                              />
                                            </div>
                                            <button 
                                                onClick={() => handleGenerateFix(selectedAnnotation.id, selectedAnnotation.suggestionPrompt || selectedAnnotation.suggestion || "")}
                                                className="w-full py-2 text-xs font-bold text-gray-500 hover:text-excali-purple underline decoration-dashed"
                                            >
                                                Regenerate
                                            </button>
                                        </div>
                                    ) : (
                                        <button 
                                            onClick={() => handleGenerateFix(selectedAnnotation.id, selectedAnnotation.suggestionPrompt || selectedAnnotation.suggestion || "")}
                                            disabled={!!generatingId}
                                            className="w-full py-2.5 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 rounded-md shadow-sm hover:shadow-md font-hand font-bold text-lg transition-all flex items-center justify-center gap-2 group"
                                        >
                                            {generatingId === selectedAnnotation.id ? <Loader2 className="animate-spin" size={16}/> : <Sparkles size={16} className="group-hover:text-excali-purple"/>}
                                            {generatingId === selectedAnnotation.id ? "Sketching..." : "Visualize Fix"}
                                        </button>
                                    )}
                            </div>
                          )}
                    </div>
                </div>
            ) : (
                /* List View */
                 <div className="space-y-3">
                   {result?.annotations?.map(ann => (
                    <div 
                        key={ann.id}
                        onClick={() => setSelectedId(ann.id)}
                        className={`p-4 rounded-lg border cursor-pointer transition-all duration-200 relative group bg-white ${selectedId === ann.id ? 'border-excali-purple shadow-[2px_2px_0px_#6965db]' : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'}`}
                    >
                        <div className="flex items-start gap-3">
                            <div className={`mt-0.5 flex-shrink-0 ${ann.sentiment === Sentiment.RISK ? 'text-red-500' : 'text-green-500'}`}>
                              {ann.sentiment === Sentiment.RISK ? <AlertTriangle size={18} /> : <CheckCircle size={18} />}
                            </div>
                            <div>
                                <h4 className="font-hand font-bold text-lg leading-none mb-1 text-gray-800">{ann.label}</h4>
                                <p className="text-xs text-gray-500 line-clamp-2 font-sans">{ann.description}</p>
                            </div>
                        </div>
                    </div>
                 ))}
                 </div>
            )}
        </div>
      </div>
      
      {/* Mobile/Tablet Backdrop for Results */}
      {showMobileResults && (
        <div className="lg:hidden absolute inset-0 z-10 bg-black/20 backdrop-blur-sm" onClick={() => setShowMobileResults(false)}></div>
      )}
    </div>
  );
};

export default AuditView;
