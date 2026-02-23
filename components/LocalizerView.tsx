
import React, { useState, useRef } from 'react';
import { AppSettings, KnowledgeFile, AUDIENCE_GROUPS, LocalizedConcept, LocalizerResult } from '../types';
import { localizeEffect, generateAlternativeImage, uploadKnowledgeFile, processImageForGemini } from '../services/geminiService';
import { Sparkles, Upload, Globe, Loader2, Image as ImageIcon, CheckCircle2, AlertCircle, RefreshCw, ChevronRight, Video, Instagram, Music2, FileCode } from 'lucide-react';
import KnowledgeDrawer from './KnowledgeDrawer';

interface LocalizerViewProps {
    settings: AppSettings;
    knowledgeFiles: KnowledgeFile[];
    onUploadKnowledge: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onAddLink: (url: string) => void;
    onRemoveKnowledge: (id: string) => void;
    onToggleKnowledgeActive: (id: string) => void;
    onToggleAllKnowledge: (active: boolean) => void;
    isUploadingKnowledge: boolean;
}

const LocalizerView: React.FC<LocalizerViewProps> = ({
    settings,
    knowledgeFiles,
    onUploadKnowledge,
    onAddLink,
    onRemoveKnowledge,
    onToggleKnowledgeActive,
    onToggleAllKnowledge,
    isUploadingKnowledge
}) => {
    const [selectedRegion, setSelectedRegion] = useState(AUDIENCE_GROUPS[0].label);
    const [isProcessing, setIsProcessing] = useState(false);
    const [beforeImage, setBeforeImage] = useState<{ file: File, preview: string } | null>(null);
    const [afterImage, setAfterImage] = useState<{ file: File, preview: string } | null>(null);
    const [effectDescription, setEffectDescription] = useState('');
    const [emotionKeywords, setEmotionKeywords] = useState('');
    const [useCases, setUseCases] = useState('');
    const [isDraggingBefore, setIsDraggingBefore] = useState(false);
    const [isDraggingAfter, setIsDraggingAfter] = useState(false);
    const [result, setResult] = useState<LocalizerResult | null>(null);
    const [generatingImages, setGeneratingImages] = useState<Record<string, boolean>>({});
    const [error, setError] = useState<string | null>(null);
    const [isKnowledgeOpen, setIsKnowledgeOpen] = useState(false);
    
    const beforeInputRef = useRef<HTMLInputElement>(null);
    const afterInputRef = useRef<HTMLInputElement>(null);

    const handleBeforeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            processBeforeFile(e.target.files[0]);
        }
    };

    const processBeforeFile = (file: File) => {
        const preview = URL.createObjectURL(file);
        setBeforeImage({ file, preview });
        setResult(null);
        setError(null);
    };

    const handleAfterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            processAfterFile(e.target.files[0]);
        }
    };

    const processAfterFile = (file: File) => {
        const preview = URL.createObjectURL(file);
        setAfterImage({ file, preview });
        setResult(null);
        setError(null);
    };

    const handleDragOverBefore = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDraggingBefore(true);
    };

    const handleDragLeaveBefore = () => {
        setIsDraggingBefore(false);
    };

    const handleDropBefore = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDraggingBefore(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            processBeforeFile(e.dataTransfer.files[0]);
        }
    };

    const handleDragOverAfter = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDraggingAfter(true);
    };

    const handleDragLeaveAfter = () => {
        setIsDraggingAfter(false);
    };

    const handleDropAfter = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDraggingAfter(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            processAfterFile(e.dataTransfer.files[0]);
        }
    };

    const handleLocalize = async () => {
        if (!beforeImage || !afterImage) return;
        
        setIsProcessing(true);
        setError(null);
        
        try {
            // 1. Upload both files
            const [beforeRes, afterRes] = await Promise.all([
                uploadKnowledgeFile(beforeImage.file, settings.apiKey),
                uploadKnowledgeFile(afterImage.file, settings.apiKey)
            ]);
            
            // 2. Localize
            const localizationResult = await localizeEffect(
                { uri: beforeRes.uri, mimeType: beforeRes.mimeType },
                { uri: afterRes.uri, mimeType: afterRes.mimeType },
                selectedRegion,
                knowledgeFiles,
                settings.apiKey,
                settings.generalModel,
                settings.localizerSystemPrompt,
                effectDescription,
                emotionKeywords,
                useCases
            );
            
            setResult(localizationResult);
            
            // 3. Trigger image generation for each concept automatically
            localizationResult.concepts.forEach(concept => {
                generateConceptImage(concept.id, concept.beforeVisualPrompt, concept.afterVisualPrompt);
            });

        } catch (err: any) {
            console.error(err);
            if (err.message === "PERMISSION_DENIED_PRO_MODEL" || err.message === "PRO_MODEL_KEY_REQUIRED" || err.message === "PRO_MODEL_KEY_EXPIRED") {
                const reason = err.message === "PRO_MODEL_KEY_EXPIRED" ? "Your session has expired." : "This high-quality model requires a connected Google Account.";
                setError(`${reason} Please use the 'Continue with Google' button in Settings.`);
            } else {
                setError(err.message || "Failed to localize effect. Please check your API key and file format.");
            }
        } finally {
            setIsProcessing(false);
        }
    };

    const generateConceptImage = async (conceptId: string, beforePrompt: string, afterPrompt: string) => {
        setGeneratingImages(prev => ({ ...prev, [conceptId]: true }));
        try {
            // 1. Generate the "Before" image (localized subject/setting)
            const beforeImageUrl = await generateAlternativeImage(beforePrompt, settings.apiKey, settings.imageModel);
            
            // Update state with before image immediately so user sees progress
            setResult(prev => {
                if (!prev) return null;
                return {
                    ...prev,
                    concepts: prev.concepts.map(c => c.id === conceptId ? { ...c, demoBeforeImageUrl: beforeImageUrl } : c)
                };
            });

            // 2. Generate the "After" image using the "Before" image as reference for consistency
            const beforeImageParts = beforeImageUrl.split(',');
            const mimeType = beforeImageParts[0].split(':')[1].split(';')[0];
            const base64 = beforeImageParts[1];
            
            const afterImageUrl = await generateAlternativeImage(afterPrompt, settings.apiKey, settings.imageModel, { base64, mimeType });

            setResult(prev => {
                if (!prev) return null;
                return {
                    ...prev,
                    concepts: prev.concepts.map(c => c.id === conceptId ? { 
                        ...c, 
                        demoImageUrl: afterImageUrl,
                        demoBeforeImageUrl: beforeImageUrl 
                    } : c)
                };
            });
        } catch (err: any) {
            console.error("Image generation failed for concept", conceptId, err);
            if (err.message === "PRO_MODEL_KEY_REQUIRED" || err.message === "PRO_MODEL_KEY_EXPIRED") {
                setError("Pro Image Model requires a connected Google Account. Check Settings.");
            }
        } finally {
            setGeneratingImages(prev => ({ ...prev, [conceptId]: false }));
        }
    };

    return (
        <div className="flex h-full overflow-hidden">
            <div className="flex-1 flex flex-col overflow-hidden p-6 gap-6">
                
                {/* Header */}
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="font-hand text-4xl font-bold text-gray-800 flex items-center gap-3">
                            <Sparkles className="text-excali-purple" size={32} /> Effect Localizer
                        </h1>
                        <p className="text-gray-500 font-sans mt-1 flex items-center gap-2">
                            <span>Localize AI effects for global cultural resonance.</span>
                            <span className="flex items-center gap-1 px-2 py-0.5 bg-black text-white text-[10px] rounded-full font-bold uppercase tracking-tighter">
                                <Video size={10} /> TikTok
                            </span>
                            <span className="flex items-center gap-1 px-2 py-0.5 bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-500 text-white text-[10px] rounded-full font-bold uppercase tracking-tighter">
                                <Instagram size={10} /> Instagram
                            </span>
                        </p>
                    </div>
                    
                    <button 
                        onClick={() => setIsKnowledgeOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl font-hand font-bold text-gray-600 hover:bg-gray-50 transition-all shadow-sm"
                    >
                        <Globe size={18} className="text-excali-purple" /> Knowledge Base
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-8">
                    
                    {/* Input Section */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Before Image */}
                        <div className="space-y-3">
                            <label className="text-xs font-bold uppercase text-gray-400 tracking-widest flex items-center gap-2">
                                <ImageIcon size={14} /> 01. Original (Before)
                            </label>
                            <div 
                                className={`bg-white border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center transition-all cursor-pointer hover:bg-gray-50 aspect-video relative overflow-hidden ${beforeImage ? 'border-excali-purple/30' : 'border-gray-200'} ${isDraggingBefore ? 'border-excali-purple bg-excali-purple/5 scale-[1.02]' : ''}`}
                                onClick={() => beforeInputRef.current?.click()}
                                onDragOver={handleDragOverBefore}
                                onDragLeave={handleDragLeaveBefore}
                                onDrop={handleDropBefore}
                            >
                                <input 
                                    type="file" 
                                    ref={beforeInputRef}
                                    className="hidden" 
                                    accept="image/*,video/*,image/gif"
                                    onChange={handleBeforeChange}
                                />
                                {beforeImage ? (
                                    <div className="absolute inset-0 group">
                                        {beforeImage.file.type.startsWith('video') ? (
                                            <video src={beforeImage.preview} className="w-full h-full object-cover" autoPlay muted loop />
                                        ) : (
                                            <img src={beforeImage.preview} alt="Before" className="w-full h-full object-cover" />
                                        )}
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <RefreshCw className="text-white animate-spin-slow" size={32} />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center">
                                        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3 text-gray-400">
                                            <Upload size={20} />
                                        </div>
                                        <p className="text-sm font-bold text-gray-500">Upload Original</p>
                                        <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-tight">Image, Video, or GIF</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* After Image */}
                        <div className="space-y-3">
                            <label className="text-xs font-bold uppercase text-gray-400 tracking-widest flex items-center gap-2">
                                <Sparkles size={14} className="text-excali-purple" /> 02. Effect (After)
                            </label>
                            <div 
                                className={`bg-white border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center transition-all cursor-pointer hover:bg-gray-50 aspect-video relative overflow-hidden ${afterImage ? 'border-excali-purple/30' : 'border-gray-200'} ${isDraggingAfter ? 'border-excali-purple bg-excali-purple/5 scale-[1.02]' : ''}`}
                                onClick={() => afterInputRef.current?.click()}
                                onDragOver={handleDragOverAfter}
                                onDragLeave={handleDragLeaveAfter}
                                onDrop={handleDropAfter}
                            >
                                <input 
                                    type="file" 
                                    ref={afterInputRef}
                                    className="hidden" 
                                    accept="image/*,video/*,image/gif"
                                    onChange={handleAfterChange}
                                />
                                {afterImage ? (
                                    <div className="absolute inset-0 group">
                                        {afterImage.file.type.startsWith('video') ? (
                                            <video src={afterImage.preview} className="w-full h-full object-cover" autoPlay muted loop />
                                        ) : (
                                            <img src={afterImage.preview} alt="After" className="w-full h-full object-cover" />
                                        )}
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <RefreshCw className="text-white animate-spin-slow" size={32} />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center">
                                        <div className="w-12 h-12 bg-excali-purple/10 rounded-full flex items-center justify-center mx-auto mb-3 text-excali-purple">
                                            <Sparkles size={20} />
                                        </div>
                                        <p className="text-sm font-bold text-gray-500">Upload Effect</p>
                                        <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-tight">Image, Video, or GIF</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Region Selection & Action */}
                    <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm flex flex-col justify-between">
                        <div className="space-y-6">
                            <div>
                                <label className="block text-xs font-bold uppercase text-gray-400 mb-3 flex items-center gap-1">
                                    <Globe size={14} /> Target Region
                                </label>
                                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
                                    {AUDIENCE_GROUPS.map(group => (
                                        <button
                                            key={group.label}
                                            onClick={() => setSelectedRegion(group.label)}
                                            className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all border ${selectedRegion === group.label ? 'bg-excali-purple text-white border-excali-purple shadow-sketch' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
                                        >
                                            {group.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase text-gray-400 mb-3 flex items-center gap-1">
                                    <FileCode size={14} /> Effect Description (Optional)
                                </label>
                                <textarea 
                                    className="w-full p-4 border border-gray-200 rounded-xl bg-gray-50 text-sm focus:outline-none focus:border-excali-purple focus:ring-2 focus:ring-excali-purple/20 transition-all resize-none h-20"
                                    placeholder="Describe the visual transformation or the core mechanic of the effect..."
                                    value={effectDescription}
                                    onChange={e => setEffectDescription(e.target.value)}
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-xs font-bold uppercase text-gray-400 mb-3 flex items-center gap-1">
                                        <Sparkles size={14} className="text-excali-purple" /> Emotion Keywords
                                    </label>
                                    <input 
                                        type="text"
                                        className="w-full p-4 border border-gray-200 rounded-xl bg-gray-50 text-sm focus:outline-none focus:border-excali-purple focus:ring-2 focus:ring-excali-purple/20 transition-all"
                                        placeholder="e.g., Nostalgic, Energetic, Dreamy..."
                                        value={emotionKeywords}
                                        onChange={e => setEmotionKeywords(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase text-gray-400 mb-3 flex items-center gap-1">
                                        <Globe size={14} /> Use Cases
                                    </label>
                                    <input 
                                        type="text"
                                        className="w-full p-4 border border-gray-200 rounded-xl bg-gray-50 text-sm focus:outline-none focus:border-excali-purple focus:ring-2 focus:ring-excali-purple/20 transition-all"
                                        placeholder="e.g., Travel vlogs, Daily life, Fashion..."
                                        value={useCases}
                                        onChange={e => setUseCases(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="mt-8">
                                {error && (
                                    <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-lg flex items-start gap-2 text-red-600 text-xs animate-in slide-in-from-top-2">
                                        <AlertCircle size={14} className="shrink-0 mt-0.5" />
                                        <span>{error}</span>
                                    </div>
                                )}
                                
                                <button
                                    onClick={handleLocalize}
                                    disabled={!beforeImage || !afterImage || isProcessing}
                                    className={`w-full py-4 rounded-2xl font-hand font-bold text-2xl flex items-center justify-center gap-3 transition-all ${!beforeImage || !afterImage || isProcessing ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-excali-purple text-white shadow-sketch hover:shadow-sketch-hover hover:-translate-y-1'}`}
                                >
                                    {isProcessing ? (
                                        <>
                                            <Loader2 size={24} className="animate-spin" />
                                            Localizing...
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles size={24} />
                                            Generate Localized Concepts
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Results Section */}
                    {result && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            {result.analysis && (
                                <div className="bg-excali-purple/5 border border-excali-purple/10 rounded-2xl p-6">
                                    <h3 className="text-sm font-bold uppercase text-excali-purple tracking-widest mb-2 flex items-center gap-2">
                                        <Sparkles size={16} /> AI Effect Analysis
                                    </h3>
                                    <p className="text-gray-700 leading-relaxed italic">
                                        "{result.analysis}"
                                    </p>
                                </div>
                            )}

                            <div className="flex items-center gap-3">
                                <div className="h-px flex-1 bg-gray-200" />
                                <h2 className="font-hand text-2xl font-bold text-gray-400 uppercase tracking-widest">Localized Concepts for {result.region}</h2>
                                <div className="h-px flex-1 bg-gray-200" />
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                {result.concepts.map((concept, idx) => (
                                    <div 
                                        key={concept.id} 
                                        className="bg-white border border-gray-200 rounded-2xl overflow-hidden flex flex-col shadow-sm hover:shadow-md transition-shadow group"
                                        style={{ animationDelay: `${idx * 150}ms` }}
                                    >
                                        {/* Before & After Images */}
                                        <div className="grid grid-cols-2 border-b border-gray-100">
                                            {/* Before */}
                                            <div className="aspect-square bg-gray-50 relative overflow-hidden border-r border-gray-100">
                                                {generatingImages[concept.id] && !concept.demoBeforeImageUrl ? (
                                                     <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm z-10">
                                                        <Loader2 size={24} className="text-excali-purple animate-spin mb-1" />
                                                        <span className="text-[8px] font-bold uppercase text-excali-purple tracking-widest">Localizing...</span>
                                                    </div>
                                                ) : concept.demoBeforeImageUrl ? (
                                                    <img src={concept.demoBeforeImageUrl} alt="Before" className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="absolute inset-0 flex items-center justify-center text-gray-300 italic text-[10px] p-4 text-center">
                                                        Localized subject will appear here
                                                    </div>
                                                )}
                                                <div className="absolute top-2 left-2 bg-excali-purple text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full shadow-sm z-10">
                                                    Concept 0{idx + 1}
                                                </div>
                                                <div className="absolute bottom-2 left-2 bg-black/60 text-white text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-widest backdrop-blur-sm">
                                                    Before
                                                </div>
                                            </div>

                                            {/* After */}
                                            <div className="aspect-square bg-gray-50 relative overflow-hidden">
                                                {generatingImages[concept.id] ? (
                                                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm z-10">
                                                        <Loader2 size={24} className="text-excali-purple animate-spin mb-1" />
                                                        <span className="text-[8px] font-bold uppercase text-excali-purple tracking-widest">Generating...</span>
                                                    </div>
                                                ) : concept.demoImageUrl ? (
                                                    <img 
                                                        src={concept.demoImageUrl} 
                                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
                                                        alt={concept.title} 
                                                    />
                                                ) : (
                                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-300">
                                                        <ImageIcon size={24} strokeWidth={1} />
                                                        <button 
                                                            onClick={() => generateConceptImage(concept.id, concept.beforeVisualPrompt, concept.afterVisualPrompt)}
                                                            className="mt-1 text-[8px] font-bold uppercase text-excali-purple hover:underline"
                                                        >
                                                            Retry
                                                        </button>
                                                    </div>
                                                )}
                                                <div className="absolute bottom-2 left-2 bg-excali-purple/80 text-white text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-widest backdrop-blur-sm">
                                                    After
                                                </div>
                                            </div>
                                        </div>

                                        {/* Content */}
                                        <div className="p-5 flex-1 flex flex-col">
                                            <h3 className="font-hand text-2xl font-bold text-gray-800 mb-4">{concept.title}</h3>
                                            
                                            <div className="space-y-4 flex-1">
                                                <div>
                                                    <h4 className="text-[10px] font-bold uppercase text-gray-400 tracking-wider mb-1 flex items-center gap-1">
                                                        <Globe size={10} /> Environmental Context
                                                    </h4>
                                                    <p className="text-xs text-gray-600 leading-relaxed">{concept.environmentalContext}</p>
                                                </div>
                                                
                                                <div>
                                                    <h4 className="text-[10px] font-bold uppercase text-gray-400 tracking-wider mb-1 flex items-center gap-1">
                                                        <Music2 size={10} /> Emotional Motivation & Vibe
                                                    </h4>
                                                    <p className="text-xs text-gray-600 leading-relaxed">{concept.emotionalMotivation}</p>
                                                </div>
                                            </div>

                                            <div className="mt-6 pt-4 border-t border-gray-50 flex justify-between items-center">
                                                <div className="flex items-center gap-1 text-green-600">
                                                    <CheckCircle2 size={14} />
                                                    <span className="text-[10px] font-bold uppercase">Culturally Validated</span>
                                                </div>
                                                <button className="text-gray-400 hover:text-excali-purple transition-colors">
                                                    <ChevronRight size={20} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Knowledge Base Drawer */}
            <KnowledgeDrawer 
                isOpen={isKnowledgeOpen}
                onClose={() => setIsKnowledgeOpen(false)}
                files={knowledgeFiles}
                onUpload={onUploadKnowledge}
                onAddLink={onAddLink}
                onRemove={onRemoveKnowledge}
                onToggleActive={onToggleKnowledgeActive}
                onToggleAll={onToggleAllKnowledge}
                isUploading={isUploadingKnowledge}
            />
        </div>
    );
};

export default LocalizerView;
