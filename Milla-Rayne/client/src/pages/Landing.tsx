import React, { useState, useEffect } from 'react';
import LoginDialog from '../components/auth/LoginDialog';

const GITHUB_URL = 'https://github.com/mrdannyclark82/Milla-Deer';
const DEMO_URL = 'https://processors-event-utilities-tops.trycloudflare.com';

interface LandingProps {
  onLoginSuccess?: () => void;
  loginMode?: boolean;
}

interface FeatureCardProps {
  icon: string;
  title: string;
  description: string;
}

const FeatureCard: React.FC<FeatureCardProps> = ({ icon, title, description }) => (
  <div className="rounded-xl border border-pink-500/20 bg-[#0d0d1a] p-6 hover:border-pink-500/50 hover:shadow-[0_0_24px_rgba(244,114,182,0.15)] transition-all duration-300">
    <div className="text-3xl mb-3">{icon}</div>
    <h3 className="text-white font-semibold text-lg mb-2">{title}</h3>
    <p className="text-slate-400 text-sm leading-relaxed">{description}</p>
  </div>
);

interface PricingCardProps {
  tier: string;
  price: string;
  period?: string;
  features: string[];
  highlighted?: boolean;
  cta: string;
  href: string;
  onCta?: (e: React.MouseEvent) => void;
}

const PricingCard: React.FC<PricingCardProps> = ({
  tier,
  price,
  period,
  features,
  highlighted,
  cta,
  href,
  onCta,
}) => (
  <div
    className={`rounded-xl p-6 flex flex-col gap-4 transition-all duration-300 ${
      highlighted
        ? 'border-2 border-pink-500 bg-[#0d0d1a] shadow-[0_0_40px_rgba(244,114,182,0.25)]'
        : 'border border-pink-500/20 bg-[#0a0a0f]'
    }`}
  >
    {highlighted && (
      <div className="text-xs font-bold text-pink-400 uppercase tracking-widest">Most Popular</div>
    )}
    <div>
      <div className="text-slate-400 text-sm mb-1">{tier}</div>
      <div className="flex items-end gap-1">
        <span className="text-4xl font-bold text-white">{price}</span>
        {period && <span className="text-slate-400 text-sm mb-1">{period}</span>}
      </div>
    </div>
    <ul className="flex flex-col gap-2 flex-1">
      {features.map((f) => (
        <li key={f} className="flex items-start gap-2 text-slate-300 text-sm">
          <span className="text-pink-400 mt-0.5">✓</span>
          {f}
        </li>
      ))}
    </ul>
    <a
      href={href}
      onClick={onCta}
      className={`block text-center py-2.5 px-4 rounded-lg font-semibold text-sm transition-all duration-200 ${
        highlighted
          ? 'bg-pink-500 text-white hover:bg-pink-400'
          : 'border border-pink-500/40 text-pink-400 hover:border-pink-400 hover:text-pink-300'
      }`}
    >
      {cta}
    </a>
  </div>
);

const Landing: React.FC<LandingProps> = ({ onLoginSuccess, loginMode = false }) => {
  const [loginOpen, setLoginOpen] = useState(loginMode);

  useEffect(() => {
    if (loginMode) setLoginOpen(true);
  }, [loginMode]);

  const openLogin = (e: React.MouseEvent) => {
    e.preventDefault();
    setLoginOpen(true);
  };

  const handleLoginSuccess = (user: { id: string; username: string; email: string }) => {
    setLoginOpen(false);
    onLoginSuccess?.();
  };

  return (
    <div className="min-h-screen bg-[#06060f] text-white">
      <LoginDialog
        isOpen={loginOpen}
        onClose={() => setLoginOpen(false)}
        onLoginSuccess={handleLoginSuccess}
      />
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 backdrop-blur-md bg-[#06060f]/80 border-b border-white/5">
        <span className="font-bold text-lg tracking-tight">
          Milla<span className="text-pink-400">-Rayne</span>
        </span>
        <div className="hidden md:flex items-center gap-6 text-sm text-slate-400">
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">GitHub</a>
        </div>
        <a
          href="/chat"
          onClick={openLogin}
          className="bg-pink-500 hover:bg-pink-400 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          Launch App
        </a>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-24 px-6 overflow-hidden">
        {/* Animated gradient orbs */}
        <div className="absolute top-20 left-1/4 w-[600px] h-[600px] rounded-full bg-pink-500/10 blur-[120px] pointer-events-none" />
        <div className="absolute top-40 right-1/4 w-[400px] h-[400px] rounded-full bg-purple-500/10 blur-[100px] pointer-events-none" />

        <div className="relative max-w-4xl mx-auto text-center">
          <div className="inline-block text-xs font-semibold tracking-widest uppercase text-pink-400 border border-pink-500/30 rounded-full px-4 py-1.5 mb-6">
            v1.0.0-beta — Now Open Source
          </div>
          <h1 className="text-5xl md:text-7xl font-extrabold leading-tight tracking-tight mb-6">
            Your AI.{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-purple-400">
              Your Hardware.
            </span>
            <br />
            Your Rules.
          </h1>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Milla-Rayne is an offline-first AI companion that runs on your phone, controls your home,
            and remembers everything — with zero cloud dependency.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <a
              href="/chat"
              onClick={openLogin}
              className="bg-pink-500 hover:bg-pink-400 text-white font-bold px-8 py-3.5 rounded-xl text-base transition-all duration-200 shadow-[0_0_30px_rgba(244,114,182,0.4)] hover:shadow-[0_0_40px_rgba(244,114,182,0.6)]"
            >
              Get Started Free
            </a>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="border border-white/20 hover:border-white/40 text-white font-semibold px-8 py-3.5 rounded-xl text-base transition-all duration-200 flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
              </svg>
              View on GitHub
            </a>
          </div>
          <div className="mt-8 text-sm text-slate-500">
            🔗 <a href={DEMO_URL} className="text-pink-400 hover:text-pink-300 underline" target="_blank" rel="noopener noreferrer">Live demo →</a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-4xl font-bold mb-4">Everything you need. Nothing you don't.</h2>
            <p className="text-slate-400 max-w-xl mx-auto">Built for power users who refuse to trade privacy for capability.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <FeatureCard
              icon="��"
              title="Offline-First"
              description="Runs Gemma-3 1B 4-bit on your Android GPU via MediaPipe. Sub-150ms responses with zero internet required."
            />
            <FeatureCard
              icon="🏠"
              title="Smart Home"
              description="Native Home Assistant WebSocket + MQTT. Controls lights, thermostats, and scenes via natural language."
            />
            <FeatureCard
              icon="🔐"
              title="Private by Default"
              description="AES-256-GCM encrypted memory stored in local SQLite. Your conversations never leave your hardware unless you say so."
            />
            <FeatureCard
              icon="🧠"
              title="Learns You"
              description="RAG vector search over your conversation history. Milla remembers context across every session and grows smarter."
            />
            <FeatureCard
              icon="🌊"
              title="Conscious"
              description="GIM and REM thought cycles run continuously. Internal monologue, proactive reasoning — not just a request/response loop."
            />
            <FeatureCard
              icon="⚡"
              title="Blazing Fast"
              description="Sub-150ms voice on Android. RDMA/RoCE v2 dual-PC link for high-throughput local inference at sub-microsecond latency."
            />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 px-6 bg-[#08080f]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-4xl font-bold mb-4">Simple, transparent pricing</h2>
            <p className="text-slate-400 max-w-lg mx-auto">Start free, upgrade when you need more. No surprise bills.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <PricingCard
              tier="Free"
              price="$0"
              features={[
                'Local inference (Gemma-3 on Android)',
                'Full web UI',
                'Basic encrypted memory',
                'Browser extension',
                'CLI access',
                'Community support',
              ]}
              cta="Get Started"
              href="#"
              onCta={openLogin}
            />
            <PricingCard
              tier="Pro"
              price="$12"
              period="/mo"
              highlighted
              features={[
                'Everything in Free',
                'Gmail + Telegram integration',
                'Home Assistant & MQTT control',
                'Cloud memory backup',
                'Priority AI models (GPT-4o, Gemini Pro)',
                'Vision grounding (Qwen-2.5-VL)',
                'Email support',
              ]}
              cta="Start Pro Trial"
              href="#"
              onCta={openLogin}
            />
            <PricingCard
              tier="Enterprise"
              price="$49"
              period="/mo"
              features={[
                'Everything in Pro',
                'Multi-user deployment',
                'RDMA dual-PC setup assistance',
                'Dedicated support + SLA',
                'White-label branding',
                'Custom MCP tool integration',
                'On-premise deployment support',
              ]}
              cta="Contact Us"
              href={`mailto:mrdannyclark82@gmail.com?subject=Milla-Rayne Enterprise`}
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-slate-500">
          <span>© 2025 Milla-Rayne — MIT License</span>
          <div className="flex items-center gap-6">
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">GitHub</a>
            <a href="/privacy" className="hover:text-white transition-colors">Privacy Policy</a>
            <a href="mailto:mrdannyclark82@gmail.com" className="hover:text-white transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
