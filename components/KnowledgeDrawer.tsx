import React, { useState } from 'react';
import { KnowledgeFile } from '../types';
import { Library, X, FileText, Trash2, Loader2, Upload, Youtube, Globe, Plus } from 'lucide-react';

interface KnowledgeDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  files: KnowledgeFile[];
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAddLink: (url: string) => void;
  onRemove: (id: string) => void;
  isUploading: boolean;
  description?: string;
}

const KnowledgeDrawer: React.FC<KnowledgeDrawerProps> = ({
  isOpen,
  onClose,
  files,
  onUpload,
  onAddLink,
  onRemove,
  isUploading,
  description
}) => {
  const [activeTab, setActiveTab] = useState<'FILE' | 'LINK'>('FILE');
  const [linkInput, setLinkInput] = useState('');

  if (!isOpen) return null;

  const handleLinkSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (linkInput.trim()) {
          onAddLink(linkInput.trim());
          setLinkInput('');
      }
  };

  const getIconForSource = (file: KnowledgeFile) => {
      if (file.sourceType === 'LINK') {
          if (file.name.includes('youtube.com') || file.name.includes('youtu.be')) {
              return <Youtube size={16} className="text-red-500" />;
          }
          return <Globe size={16} className="text-blue-500" />;
      }
      return <FileText size={16} className="text-gray-500" />;
  };

  return (
    <div className="absolute top-16 right-0 bottom-0 w-80 bg-white shadow-2xl border-l border-gray-200 z-30 flex flex-col animate-in slide-in-from-right duration-200">
      <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
        <h3 className="font-hand font-bold text-lg flex items-center gap-2">
          <Library size={18} /> Knowledge Base
        </h3>
        <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
      </div>

      {description && (
        <div className="px-4 py-3 bg-blue-50 text-blue-800 text-xs border-b border-blue-100 leading-relaxed">
          {description}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
          <button 
            onClick={() => setActiveTab('FILE')}
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-wide transition-colors ${activeTab === 'FILE' ? 'text-excali-purple border-b-2 border-excali-purple bg-excali-purpleLight/10' : 'text-gray-400 hover:text-gray-600'}`}
          >
              Upload File
          </button>
          <button 
            onClick={() => setActiveTab('LINK')}
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-wide transition-colors ${activeTab === 'LINK' ? 'text-excali-purple border-b-2 border-excali-purple bg-excali-purpleLight/10' : 'text-gray-400 hover:text-gray-600'}`}
          >
              Add Link
          </button>
      </div>

      {/* Add Content Area */}
      <div className="p-4 bg-gray-50 border-b border-gray-100">
          {activeTab === 'FILE' ? (
             <label className={`flex items-center justify-center gap-2 w-full py-3 border-2 border-dashed border-gray-300 rounded-xl hover:border-excali-purple hover:bg-white cursor-pointer transition-all ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <input 
                    type="file" 
                    className="hidden" 
                    // Added .doc and .docx support
                    accept=".pdf,.csv,.txt,.md,.png,.jpg,.jpeg,.xlsx,.xls,.doc,.docx" 
                    onChange={onUpload} 
                    disabled={isUploading} 
                />
                {isUploading ? <Loader2 className="animate-spin" size={20} /> : <Upload size={20} className="text-gray-400" />}
                <span className="font-hand font-bold text-gray-600">Click to Upload</span>
             </label>
          ) : (
              <form onSubmit={handleLinkSubmit} className="flex gap-2">
                  <input 
                    type="url" 
                    placeholder="https://..." 
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-excali-purple"
                    value={linkInput}
                    onChange={(e) => setLinkInput(e.target.value)}
                    required
                  />
                  <button type="submit" className="bg-excali-purple text-white p-2 rounded-lg hover:shadow-sm">
                      <Plus size={20} />
                  </button>
              </form>
          )}
          <div className="mt-2 text-[10px] text-gray-400 text-center">
              {activeTab === 'FILE' 
                ? "Supports: PDF, Word, Excel, CSV, TXT, Images" 
                : "Supports: YouTube Videos, Websites"}
          </div>
      </div>

      {/* List Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {files.length === 0 && (
            <div className="text-center py-8 px-4 text-gray-300 text-sm italic font-hand">
                Knowledge base is empty.
            </div>
        )}

        {files.map(file => (
          <div key={file.id} className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg shadow-sm group hover:border-excali-purple/30 transition-colors">
            <div className="w-8 h-8 bg-gray-50 rounded flex items-center justify-center flex-shrink-0">
              {getIconForSource(file)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold truncate text-gray-700">{file.name}</div>
              <div className="text-[10px] flex items-center gap-1">
                {file.sourceType === 'LINK' ? (
                    <span className="text-gray-400">External Link</span>
                ) : (
                    <>
                        {file.status === 'UPLOADING' && <span className="text-blue-500 flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> Uploading...</span>}
                        {file.status === 'PROCESSING' && <span className="text-orange-500">Processing...</span>}
                        {file.status === 'READY' && <span className="text-green-500">Active</span>}
                        {file.status === 'ERROR' && <span className="text-red-500">Failed</span>}
                    </>
                )}
              </div>
            </div>
            <button onClick={() => onRemove(file.id)} className="text-gray-300 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default KnowledgeDrawer;