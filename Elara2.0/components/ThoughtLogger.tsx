
import React, { useState } from 'react';

interface ThoughtLoggerProps {
  thoughtText: string;
  isThinking: boolean;
}

const ThoughtLogger: React.FC<ThoughtLoggerProps> = ({ thoughtText, isThinking }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!thoughtText && !isThinking) return null;

  return (
    <div className="mb-4 rounded-xl overflow-hidden border border-violet-500/30 bg-slate-950/50 shadow-inner">
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 bg-violet-900/20 hover:bg-violet-900/30 transition-colors text-xs font-mono text-violet-300"
      >
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            {isThinking && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>}
            <span className={`relative inline-flex rounded-full h-2 w-2 ${isThinking ? 'bg-violet-500' : 'bg-violet-800'}`}></span>
          </span>
          <span className="uppercase tracking-wider font-bold">Milla's Thought Process</span>
        </div>
        <div className="flex items-center gap-2">
           <span className="text-[10px] opacity-60">{thoughtText.length} chars</span>
           <svg 
             className={`w-3 h-3 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
             fill="none" viewBox="0 0 24 24" stroke="currentColor"
           >
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
           </svg>
        </div>
      </button>

      {isExpanded && (
        <div className="p-3 text-xs font-mono text-violet-200/80 leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto custom-scrollbar bg-slate-950/30">
          {thoughtText || (
            <span className="italic opacity-50 flex items-center gap-1">
              Analyzing context and formulating response...
            </span>
          )}
          {isThinking && (
             <span className="inline-block w-1.5 h-3 ml-1 bg-violet-500 animate-pulse align-middle" />
          )}
        </div>
      )}
    </div>
  );
};

export default ThoughtLogger;
