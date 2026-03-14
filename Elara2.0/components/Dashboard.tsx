import React from 'react';
import { DetailedMetrics, IntegrationStatus, PersonaMode, GrowthEntry } from '../types';
import { ResponsiveContainer, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Tooltip } from 'recharts';

interface DashboardProps {
  metrics: DetailedMetrics;
  integrations: IntegrationStatus;
  currentPersona: PersonaMode;
  onPersonaChange: (p: PersonaMode) => void;
  growthLog: GrowthEntry[];
  onClearMemory: () => void;
  onEntryClick: (entry: GrowthEntry) => void;
  memoryStats?: any;
  onExportMemory?: () => void;
  onPruneMemories?: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ 
  metrics, 
  integrations, 
  currentPersona, 
  onPersonaChange, 
  growthLog, 
  onClearMemory, 
  onEntryClick,
  memoryStats,
  onExportMemory,
  onPruneMemories
}) => {
  const metricData = Object.keys(metrics).map(key => ({
    subject: key.charAt(0).toUpperCase() + key.slice(1),
    A: metrics[key as keyof DetailedMetrics],
    fullMark: 100,
  }));

  return (
    <div className="h-full bg-slate-900/90 backdrop-blur-xl border-r border-slate-700 flex flex-col overflow-hidden">
      <div className="p-4 border-b border-slate-700 flex-shrink-0">
        <h2 className="text-xl font-bold text-white mb-1">Elara <span className="text-[10px] text-emerald-400 align-top">v3.0</span></h2>
        <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
            <p className="text-slate-400 text-[10px]">Neural Core: <span className="text-emerald-400">Gemini 3 Pro</span></p>
        </div>
      </div>

      <div className="overflow-y-auto custom-scrollbar flex-1 flex flex-col">
          <div className="p-4 border-b border-slate-700 flex-shrink-0">
            <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Live Metrics</h3>
            <div className="h-40 w-full -ml-4">
               <ResponsiveContainer width="100%" height="100%">
                 <RadarChart cx="50%" cy="50%" outerRadius="65%" data={metricData}>
                   <PolarGrid stroke="#334155" />
                   <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 8 }} />
                   <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                   <Radar name="Elara Performance" dataKey="A" stroke="#10b981" strokeWidth={2} fill="#10b981" fillOpacity={0.3} />
                   <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '10px' }} itemStyle={{ color: '#e2e8f0' }} />
                 </RadarChart>
               </ResponsiveContainer>
            </div>
          </div>

          <div className="p-4 border-b border-slate-700 flex-shrink-0">
              <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Active Modules</h3>
              <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-800 p-1.5 rounded border border-slate-600 flex items-center gap-2">
                      <i className="fab fa-google text-white text-xs"></i> <span className="text-[10px] text-slate-300">Search</span>
                  </div>
                  <div className="bg-slate-800 p-1.5 rounded border border-slate-600 flex items-center gap-2">
                      <i className="fas fa-map text-green-400 text-xs"></i> <span className="text-[10px] text-slate-300">Maps</span>
                  </div>
                  <div className="bg-slate-800 p-1.5 rounded border border-slate-600 flex items-center gap-2">
                      <i className="fas fa-video text-purple-400 text-xs"></i> <span className="text-[10px] text-slate-300">Veo</span>
                  </div>
                  <div className="bg-slate-800 p-1.5 rounded border border-slate-600 flex items-center gap-2">
                      <i className="fas fa-image text-pink-400 text-xs"></i> <span className="text-[10px] text-slate-300">Imagen</span>
                  </div>
              </div>
          </div>

          <div className="p-4 border-b border-slate-700 flex-shrink-0">
            <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Persona Matrix</h3>
            <div className="flex flex-wrap gap-1.5">
              {Object.values(PersonaMode).map((mode) => (
                <button
                  key={mode}
                  onClick={() => onPersonaChange(mode)}
                  className={`text-[10px] px-2.5 py-1.5 rounded-full border transition-all duration-300 ${
                    currentPersona === mode
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                      : 'bg-slate-800/50 text-slate-500 border-transparent hover:bg-slate-800'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 flex-1 flex flex-col min-h-[200px]">
            <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-4">Growth Journal</h3>
            <div className="space-y-4 overflow-visible flex-1 pr-2">
                {growthLog.length === 0 ? (
                    <div className="text-center text-slate-600 text-xs py-4 italic">No growth events yet...</div>
                ) : (
                    growthLog.slice().reverse().map((entry) => (
                        <div 
                            key={entry.id} 
                            onClick={() => onEntryClick(entry)}
                            className="relative pl-4 border-l border-slate-700 group cursor-pointer hover:bg-slate-800/30 rounded-r p-1 transition-colors"
                            title={entry.type === 'proposal' ? "Click for Implementation Guide" : "Click for details"}
                        >
                            <div className={`absolute -left-[5px] top-2 w-2.5 h-2.5 rounded-full ${
                                entry.type === 'learning' ? 'bg-blue-500' :
                                entry.type === 'upgrade' ? 'bg-purple-500' : 
                                entry.type === 'proposal' ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'
                            }`}></div>
                            <div className="mb-1">
                                <span className="text-xs font-bold text-white block group-hover:text-emerald-400 transition-colors">
                                    {entry.title} {entry.type === 'proposal' && <i className="fas fa-code text-[8px] ml-1 opacity-50"></i>}
                                </span>
                                <span className="text-[9px] text-slate-500">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                            </div>
                            <p className="text-[10px] text-slate-400 leading-relaxed group-hover:text-slate-300">{entry.details}</p>
                        </div>
                    ))
                )}
            </div>
          </div>
      </div>

      {/* Memory Database Section */}
      {memoryStats && (
        <div className="p-4 border-t border-slate-700 bg-slate-900/50 flex-shrink-0">
          <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">External Memory Database</h3>
          <div className="space-y-2 mb-3">
            <div className="flex justify-between items-center text-[10px]">
              <span className="text-slate-500">Total Memories:</span>
              <span className="text-emerald-400 font-bold">{memoryStats.totalMemories}</span>
            </div>
            <div className="flex justify-between items-center text-[10px]">
              <span className="text-slate-500">Avg Importance:</span>
              <span className="text-blue-400 font-bold">{memoryStats.avgImportance.toFixed(1)}/10</span>
            </div>
            {memoryStats.topTags.length > 0 && (
              <div className="mt-2">
                <span className="text-[9px] text-slate-500 block mb-1">Top Tags:</span>
                <div className="flex flex-wrap gap-1">
                  {memoryStats.topTags.slice(0, 5).map((tag: any) => (
                    <span key={tag.tag} className="text-[8px] bg-slate-800 px-1.5 py-0.5 rounded border border-slate-600 text-slate-400">
                      {tag.tag} ({tag.count})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            {onExportMemory && (
              <button 
                onClick={onExportMemory}
                className="w-full py-1.5 bg-blue-900/10 hover:bg-blue-900/30 text-blue-400 border border-blue-900/30 rounded flex items-center justify-center gap-2 text-[10px] transition-colors"
              >
                <i className="fas fa-download"></i> Export DB
              </button>
            )}
            <input 
              type="file" 
              ref={(el) => el && ((window as any).memoryImportRef = el)} 
              style={{ display: 'none' }} 
              accept=".json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  file.text().then(async (text) => {
                    try {
                      // This will be handled by the parent component's import handler
                      const event = new CustomEvent('memoryImport', { detail: text });
                      window.dispatchEvent(event);
                    } catch (err) {
                      console.error('Import error:', err);
                    }
                  });
                }
                e.target.value = ''; // Reset input
              }}
            />
            <button 
              onClick={() => (window as any).memoryImportRef?.click()}
              className="w-full py-1.5 bg-green-900/10 hover:bg-green-900/30 text-green-400 border border-green-900/30 rounded flex items-center justify-center gap-2 text-[10px] transition-colors"
            >
              <i className="fas fa-upload"></i> Import DB
            </button>
            {onPruneMemories && (
              <button 
                onClick={onPruneMemories}
                className="w-full py-1.5 bg-orange-900/10 hover:bg-orange-900/30 text-orange-400 border border-orange-900/30 rounded flex items-center justify-center gap-2 text-[10px] transition-colors"
              >
                <i className="fas fa-broom"></i> Prune Old
              </button>
            )}
          </div>
        </div>
      )}

      <div className="p-3 border-t border-slate-700 bg-slate-900/50 flex-shrink-0">
           <button 
             onClick={onClearMemory}
             className="w-full py-1.5 bg-red-900/10 hover:bg-red-900/30 text-red-500 border border-red-900/30 rounded flex items-center justify-center gap-2 text-[10px] transition-colors"
           >
               <i className="fas fa-trash-alt"></i> Purge Memory
           </button>
      </div>
    </div>
  );
};

export default Dashboard;