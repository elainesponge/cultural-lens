import React, { useRef } from 'react';
import { AuditAnnotation, Sentiment } from '../types';

interface ImageAnnotatorProps {
  imageUrl: string;
  annotations: AuditAnnotation[];
  selectedAnnotationId: string | null;
  onSelectAnnotation: (id: string) => void;
}

const ImageAnnotator: React.FC<ImageAnnotatorProps> = ({
  imageUrl,
  annotations,
  selectedAnnotationId,
  onSelectAnnotation,
}) => {
  const imgRef = useRef<HTMLImageElement>(null);

  const handleImageLoad = () => {
     // Trigger resize calculation if needed
  };

  return (
    <div className="relative inline-block group max-w-full max-h-full">
      <img
        ref={imgRef}
        src={imageUrl}
        alt="Audit Target"
        onLoad={handleImageLoad}
        className="max-w-full max-h-[85vh] object-contain block bg-white rounded-sm shadow-2xl"
      />
      
      {annotations.map((ann) => {
        const top = ann.box_2d.ymin / 10;
        const left = ann.box_2d.xmin / 10;
        const height = (ann.box_2d.ymax - ann.box_2d.ymin) / 10;
        const width = (ann.box_2d.xmax - ann.box_2d.xmin) / 10;

        const isSelected = selectedAnnotationId === ann.id;
        const isRisk = ann.sentiment === Sentiment.RISK;
        
        // Colors
        const mainColor = isRisk ? '#f87171' : '#4ade80'; // Soft Red vs Soft Green
        // Lowered Z-index to ensure it sits behind the sidebar (z-30)
        const zIndex = isSelected ? 20 : 10;

        return (
          <div
            key={ann.id}
            onClick={(e) => {
                e.stopPropagation();
                onSelectAnnotation(ann.id);
            }}
            className={`absolute cursor-pointer transition-all duration-200`}
            style={{
              top: `${top}%`,
              left: `${left}%`,
              width: `${width}%`,
              height: `${height}%`,
              zIndex: zIndex,
              // CSS Sketchy border effect
              border: `3px solid ${mainColor}`,
              borderRadius: '255px 15px 225px 15px / 15px 225px 15px 255px',
              boxShadow: isSelected ? `0 0 0 4px rgba(255,255,255,0.5), 0 4px 8px rgba(0,0,0,0.1)` : 'none',
              opacity: isSelected ? 1 : 0.7,
            }}
          >
            {/* Label Tag floating outside */}
            <div 
                className={`absolute -top-8 left-0 px-3 py-1 text-sm font-hand font-bold bg-white border-2 shadow-sm rounded-md transition-opacity whitespace-nowrap ${isSelected || 'hover:opacity-100 opacity-0'}`}
                style={{ borderColor: mainColor, color: isRisk ? '#dc2626' : '#16a34a' }}
            >
                {ann.sentiment === Sentiment.RISK ? '!' : '✓'} {ann.label}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ImageAnnotator;