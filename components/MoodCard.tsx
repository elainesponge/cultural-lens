
import React, { useEffect, useState } from 'react';
import { MoodCardData, AppSettings } from '../types';
import { Calendar, Palette, Search, Image as ImageIcon, RotateCw, AlertTriangle } from 'lucide-react';
import { generateAlternativeImage } from '../services/geminiService';

const MoodCard: React.FC<{ data: MoodCardData; settings: AppSettings }> = ({ data, settings }) => {
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [isLoadingSnapshot, setIsLoadingSnapshot] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const hasVisuals = data.visuals && data.visuals.length > 0;
  const hasColors = data.colors && data.colors.length > 0;

  // Create a stable key for visuals to prevent dependency loop/flicker
  const visualsKey = hasVisuals ? data.visuals.join(',') : '';

  const fetchVisuals = async () => {
        if (!hasVisuals) return;
        
        setIsLoadingSnapshot(true);
        setGenError(null);
        setSnapshotUrl(null);
        
        try {
            // Prompt engineered to look like a real photo or reference image
            const prompt = `A detailed, photorealistic reference photograph of ${data.title}. Elements: ${data.visuals.join(", ")}. High quality, documentary style, clear focus.`;
            const url = await generateAlternativeImage(prompt, settings.imageModel, settings.apiKey);
            setSnapshotUrl(url);
        } catch (e: any) {
            console.error("Failed to fetch visual", e);
            let msg = "Generation failed";
            if (e.message?.includes("safety")) msg = "Blocked by Safety";
            else if (e.message?.includes("429")) msg = "Rate Limit";
            setGenError(msg);
        } finally {
            setIsLoadingSnapshot(false);
        }
  };

  useEffect(() => {
    // Only auto-fetch if we haven't tried yet (no error, no url)
    if (hasVisuals && !snapshotUrl && !genError && !isLoadingSnapshot) {
        fetchVisuals();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.title, visualsKey, settings.imageModel, hasVisuals]);

  return (
    <div className="flex-shrink-0 w-[300px] bg-white border border-gray-200 rounded-xl shadow-sketch hover:shadow-sketch-lg hover:-translate-y-1 transition-all duration-200 group snap-start flex flex-col relative overflow-hidden">
      
      {/* Header Color Strip (Only if colors exist) */}
      {hasColors ? (
          <div className="h-2 w-full flex">
            {data.colors.map((c, i) => (
                <div key={i} className="h-full flex-1" style={{ backgroundColor: c }}></div>
            ))}
          </div>
      ) : (
          <div className="h-1 w-full bg-excali-purpleLight/50"></div>
      )}

      <div className="p-5 flex flex-col h-full">
         {/* Title & Date */}
         <div className="mb-4 border-b border-gray-100 pb-3">
            <h3 className="text-2xl font-hand font-bold text-excali-stroke leading-tight mb-1">{data.title}</h3>
            <div className="flex items-center gap-1 text-xs font-bold text-gray-400 uppercase tracking-wide">
                <Calendar size={12} />
                {data.timing}
            </div>
         </div>
         
         {/* Proactive Snapshot Area */}
         {hasVisuals && (
             <div className="mb-4 bg-gray-50 rounded-lg border border-gray-100 h-[180px] flex items-center justify-center overflow-hidden relative group/image">
                {isLoadingSnapshot ? (
                    <div className="flex flex-col items-center gap-3 text-gray-300 w-full h-full justify-center bg-gray-50 animate-pulse">
                        <div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-excali-purple animate-spin" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Fetching Visuals...</span>
                    </div>
                ) : snapshotUrl ? (
                    <>
                        <img src={snapshotUrl} alt={data.title} className="w-full h-full object-cover transition-transform duration-700 group-hover/image:scale-105" />
                        {/* Search Overlay Icon */}
                        <div className="absolute top-2 right-2 bg-black/50 p-1.5 rounded-full text-white backdrop-blur-sm opacity-0 group-hover/image:opacity-100 transition-opacity pointer-events-none">
                            <Search size={12} />
                        </div>
                    </>
                ) : (
                    <div className="flex flex-col items-center gap-3 text-gray-400 w-full h-full justify-center p-4 text-center">
                         {genError ? (
                            <>
                                <AlertTriangle size={24} className="text-red-300" />
                                <span className="text-xs font-bold text-red-400 uppercase">{genError}</span>
                                <button 
                                    onClick={fetchVisuals}
                                    className="mt-1 flex items-center gap-1 text-[10px] bg-white border border-gray-200 px-2 py-1 rounded shadow-sm hover:text-excali-purple hover:border-excali-purple transition-colors"
                                >
                                    <RotateCw size={10} /> Retry
                                </button>
                            </>
                         ) : (
                            <>
                                <ImageIcon size={24} className="opacity-50" />
                                <span className="text-xs font-sans">No visual found</span>
                                <button 
                                    onClick={fetchVisuals}
                                    className="mt-1 flex items-center gap-1 text-[10px] text-gray-400 hover:text-excali-purple transition-colors"
                                >
                                    Generate
                                </button>
                            </>
                         )}
                    </div>
                )}
             </div>
         )}

         <p className="font-sans text-sm text-gray-600 leading-relaxed mb-4 line-clamp-4">
             {data.description}
         </p>

         {/* Visual Keywords Chips */}
         {hasVisuals && (
             <div className="mb-4">
                 <div className="flex flex-wrap gap-2">
                    {data.visuals.slice(0, 3).map((v, i) => (
                        <span 
                            key={i} 
                            className="text-[10px] font-bold px-2 py-1 bg-gray-100 rounded-md text-gray-500"
                        >
                            {(() => {
                                // Robust Sentence Case Conversion
                                const str = v || "";
                                const lower = str.toLowerCase();
                                return lower.charAt(0).toUpperCase() + lower.slice(1);
                            })()}
                        </span>
                    ))}
                </div>
             </div>
         )}

        {/* Palette Swatches (Conditional) */}
        {hasColors && (
            <div className="mt-auto pt-2 border-t border-gray-100">
                <div className="text-[10px] font-bold uppercase text-gray-400 mb-2 flex items-center gap-1 mt-2">
                    <Palette size={10} /> Palette
                </div>
                <div className="flex gap-2">
                    {data.colors.map((color, idx) => (
                        <div key={idx} className="flex flex-col items-center gap-1">
                            <div 
                                className="w-8 h-8 rounded-full border-2 border-gray-100 shadow-sm cursor-pointer hover:scale-110 transition-transform" 
                                style={{ backgroundColor: color }}
                                title={color}
                            ></div>
                            <span className="text-[9px] font-mono text-gray-400 uppercase">{color}</span>
                        </div>
                    ))}
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default MoodCard;
