import React from 'react';
import { YouTubeVideo } from '../types';

interface YouTubePlayerProps {
  video: YouTubeVideo | null;
  onClose: () => void;
}

const YouTubePlayer: React.FC<YouTubePlayerProps> = ({ video, onClose }) => {
  if (!video) return null;

  return (
    <div className="absolute bottom-6 right-6 w-80 bg-black/90 rounded-xl overflow-hidden shadow-2xl border border-slate-700 z-50 animate-float">
      <div className="flex justify-between items-center p-2 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-2">
            <i className="fab fa-youtube text-red-500"></i>
            <span className="text-xs font-medium text-white truncate max-w-[150px]">{video.title}</span>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <i className="fas fa-times text-xs"></i>
        </button>
      </div>
      <div className="relative pt-[56.25%] bg-black">
        <iframe
          className="absolute top-0 left-0 w-full h-full"
          src={`https://www.youtube.com/embed/${video.id}?autoplay=1`}
          title="YouTube video player"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        ></iframe>
      </div>
      <div className="p-2 bg-slate-900 flex justify-between items-center">
         <span className="text-[10px] text-slate-500">PiP Mode Active</span>
         <div className="flex gap-2">
             <i className="fas fa-step-backward text-xs text-slate-400 hover:text-white cursor-pointer"></i>
             <i className="fas fa-pause text-xs text-slate-400 hover:text-white cursor-pointer"></i>
             <i className="fas fa-step-forward text-xs text-slate-400 hover:text-white cursor-pointer"></i>
         </div>
      </div>
    </div>
  );
};

export default YouTubePlayer;