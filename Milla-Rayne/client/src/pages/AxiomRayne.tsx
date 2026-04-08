import { useLocation } from 'wouter';
import {
  MessageSquare, Home, BookOpen, Newspaper, Mail, Palette, Tv2,
  Code, Database, Cpu, Settings, Bot, MonitorCog, Brain, Network, FlaskConical
} from 'lucide-react';

const ALL_MODULES = [
  { id: 'chat', label: 'Chat', icon: MessageSquare, desc: 'Talk to Milla Rayne', route: '/chat' },
  { id: 'hub', label: 'Milla Hub', icon: Home, desc: 'Central command hub', route: '/chat' },
  { id: 'knowledge', label: 'Knowledge Base', icon: BookOpen, desc: 'RAG knowledge search', route: '/chat' },
  { id: 'news', label: 'Daily News', icon: Newspaper, desc: 'AI-curated news digest', route: '/chat' },
  { id: 'gmail', label: 'Gmail & Tasks', icon: Mail, desc: 'Emails and task management', route: '/chat' },
  { id: 'studio', label: 'Studio', icon: Palette, desc: 'Creative tools', route: '/chat' },
  { id: 'fyp', label: 'For You', icon: Tv2, desc: 'Personalized content feed', route: '/chat' },
  { id: 'agents-hub', label: 'Agents Hub', icon: Bot, desc: '14 AI agents catalog', route: '/agents-hub' },
  { id: 'computer-use', label: 'Computer Use', icon: MonitorCog, desc: 'Screen capture & automation', route: '/computer-use' },
  { id: 'dream', label: 'Dream / REM', icon: Brain, desc: 'Neuro state & GIM journal', route: '/dream' },
  { id: 'swarm', label: 'Swarm', icon: Network, desc: 'Multi-agent swarm launcher', route: '/swarm' },
  { id: 'deerflow', label: 'DeerFlow Research', icon: FlaskConical, desc: 'LangGraph deep research', route: '/chat' },
  { id: 'ide', label: 'IDE Sandbox', icon: Code, desc: 'Code execution sandbox', route: '/chat' },
  { id: 'database', label: 'Data Storage', icon: Database, desc: 'Browse all databases', route: '/chat' },
  { id: 'models', label: 'AI Models', icon: Cpu, desc: 'Model selection & config', route: '/chat' },
  { id: 'settings', label: 'Settings', icon: Settings, desc: 'System configuration', route: '/chat' },
];

export default function AxiomRayne() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-[#0a0118] text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-10 text-center">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-[#00f2ff] to-[#ff00aa] bg-clip-text text-transparent mb-3">
            Axiom Rayne
          </h1>
          <p className="text-white/40 text-lg">Mission Control — All Modules</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {ALL_MODULES.map((mod) => {
            const Icon = mod.icon;
            return (
              <button
                key={mod.id}
                onClick={() => setLocation(mod.route)}
                className="group flex flex-col gap-3 p-5 rounded-2xl bg-white/5 border border-white/10 hover:bg-gradient-to-br hover:from-[#00f2ff]/10 hover:to-[#ff00aa]/10 hover:border-[#00f2ff]/30 transition-all duration-300 text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center group-hover:bg-[#00f2ff]/20 transition-colors">
                  <Icon className="w-5 h-5 text-white/50 group-hover:text-[#00f2ff] transition-colors" />
                </div>
                <div>
                  <p className="font-medium text-white text-sm">{mod.label}</p>
                  <p className="text-white/40 text-xs mt-0.5">{mod.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
