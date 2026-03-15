import React, { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  X,
  Sparkles,
  Download,
  Copy,
  Trash2,
  RefreshCw,
  Image as ImageIcon,
  Palette,
  Wand2,
  Check,
  ChevronDown,
  Square,
  RectangleHorizontal,
  RectangleVertical,
} from 'lucide-react';

interface CreativeStudioProps {
  isOpen: boolean;
  onClose: () => void;
  onSendToChat?: (imageUrl: string, prompt: string) => void;
  embedded?: boolean;
  onApplyToAvatar?: (media: {
    url: string;
    type: 'image' | 'video';
    prompt: string;
    model: string;
  }) => void;
}

interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  aspectRatio: string;
  model: string;
  timestamp: Date;
}

type AspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4';

const ASPECT_RATIOS: {
  value: AspectRatio;
  label: string;
  icon: React.ReactNode;
}[] = [
  { value: '1:1', label: 'Square', icon: <Square className="w-4 h-4" /> },
  {
    value: '16:9',
    label: 'Landscape',
    icon: <RectangleHorizontal className="w-4 h-4" />,
  },
  {
    value: '9:16',
    label: 'Portrait',
    icon: <RectangleVertical className="w-4 h-4" />,
  },
  {
    value: '4:3',
    label: 'Standard',
    icon: <RectangleHorizontal className="w-4 h-4" />,
  },
  {
    value: '3:4',
    label: 'Photo',
    icon: <RectangleVertical className="w-4 h-4" />,
  },
];

const IMAGE_MODELS = [
  { value: 'flux', label: 'Flux', description: 'High quality, balanced' },
  {
    value: 'flux-realism',
    label: 'Flux Realism',
    description: 'Photorealistic images',
  },
  {
    value: 'flux-anime',
    label: 'Flux Anime',
    description: 'Anime/manga style',
  },
  { value: 'flux-3d', label: 'Flux 3D', description: '3D rendered images' },
  { value: 'turbo', label: 'Turbo', description: 'Fast generation' },
];

const STYLE_PRESETS = [
  'Photorealistic',
  'Digital Art',
  'Oil Painting',
  'Watercolor',
  'Anime/Manga',
  'Pixel Art',
  'Minimalist',
  'Surrealist',
  '3D Render',
  'Sketch',
  'Cyberpunk',
  'Fantasy',
];

export const CreativeStudio: React.FC<CreativeStudioProps> = ({
  isOpen,
  onClose,
  embedded = false,
  onApplyToAvatar,
}) => {
  // State
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [model, setModel] = useState('flux');
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Generate image
  const generateImage = useCallback(async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);
    setError(null);

    // Build enhanced prompt with style
    const enhancedPrompt = selectedStyle
      ? `${prompt}, ${selectedStyle} style`
      : prompt;

    try {
      const response = await fetch('/api/image/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: enhancedPrompt,
          aspectRatio,
          model,
        }),
      });

      if (!response.ok) {
        throw new Error(`Generation failed: ${response.statusText}`);
      }

      const data = await response.json();

      // Handle different response formats from various image generation backends
      // (Pollinations uses 'url', some use 'imageUrl', others use 'image')
      const imageUrl = data.url || data.imageUrl || data.image;

      if (!imageUrl) {
        throw new Error('No image URL in response');
      }

      const newImage: GeneratedImage = {
        id: `img-${Date.now()}`,
        url: imageUrl,
        prompt: enhancedPrompt,
        aspectRatio,
        model,
        timestamp: new Date(),
      };

      setGeneratedImages((prev) => [newImage, ...prev]);
      setSelectedImage(newImage);
    } catch (e) {
      console.error('Image generation error:', e);
      setError(e instanceof Error ? e.message : 'Failed to generate image');
    } finally {
      setIsGenerating(false);
    }
  }, [prompt, aspectRatio, model, selectedStyle]);

  // Download image
  const downloadImage = async (image: GeneratedImage) => {
    try {
      const response = await fetch(image.url);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `milla-creative-${image.id}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Download error:', e);
    }
  };

  // Copy image URL
  const copyImageUrl = async (image: GeneratedImage) => {
    try {
      await navigator.clipboard.writeText(image.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Copy error:', e);
    }
  };

  // Delete image from history
  const deleteImage = (imageId: string) => {
    setGeneratedImages((prev) => prev.filter((img) => img.id !== imageId));
    if (selectedImage?.id === imageId) {
      setSelectedImage(null);
    }
  };

  // Clear all history
  const clearHistory = () => {
    setGeneratedImages([]);
    setSelectedImage(null);
  };

  if (!isOpen) return null;

  return (
    <div
      className={`${
        embedded
          ? 'relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-[0_25px_120px_rgba(0,0,0,0.45)] backdrop-blur-2xl'
          : 'fixed inset-4 z-50 overflow-hidden rounded-3xl border border-white/10 bg-[#0c021a]/95 shadow-2xl backdrop-blur-2xl'
      }`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-[#00f2ff]/10 via-transparent to-[#ff00aa]/10" />
      <div className="absolute -left-20 top-10 h-40 w-40 rounded-full bg-[#00f2ff]/15 blur-3xl" />
      <div className="absolute -right-16 bottom-6 h-48 w-48 rounded-full bg-[#ff00aa]/12 blur-3xl" />
      {/* Header */}
      <div className="relative z-10 flex items-center justify-between border-b border-white/10 bg-[#0c021a]/40 px-4 py-3">
        <div className="flex items-center gap-3">
          <Palette className="w-5 h-5 text-[#ff66cc]" />
          <h2 className="text-lg font-semibold text-white">Creative Studio</h2>
          <Badge className="border-[#ff00aa]/25 bg-[#ff00aa]/15 text-[#ffd6f5]">
            AI Image Generation
          </Badge>
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="text-white/60 hover:text-white hover:bg-white/10"
        >
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div className="relative z-10 grid overflow-hidden xl:grid-cols-[minmax(280px,320px)_minmax(0,1fr)_minmax(220px,260px)]">
        {/* Left Panel - Controls */}
        <div className="border-b border-white/10 bg-white/[0.03] p-4 xl:border-b-0 xl:border-r">
          {/* Prompt Input */}
          <div>
            <label className="text-sm text-white/70 mb-2 block">Prompt</label>
            <textarea
              placeholder="Describe the image you want to create..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full h-28 p-3 bg-transparent border border-white/20 rounded-lg text-white placeholder:text-white/40 resize-none focus:outline-none focus:border-cyan-500/50"
            />
          </div>

          {/* Style Presets */}
          <div>
            <label className="text-sm text-white/70 mb-2 block">Style</label>
            <div className="flex flex-wrap gap-2">
              {STYLE_PRESETS.map((style) => (
                <Badge
                  key={style}
                  className={`cursor-pointer transition-colors ${
                    selectedStyle === style
                      ? 'border-[#00f2ff]/30 bg-[#00f2ff]/20 text-[#bdfcff]'
                      : 'border-white/10 bg-white/[0.03] text-white/60 hover:border-white/20'
                  }`}
                  onClick={() =>
                    setSelectedStyle(selectedStyle === style ? null : style)
                  }
                >
                  {style}
                </Badge>
              ))}
            </div>
          </div>

          {/* Aspect Ratio */}
          <div>
            <label className="text-sm text-white/70 mb-2 block">
              Aspect Ratio
            </label>
            <div className="grid grid-cols-2 gap-2">
              {ASPECT_RATIOS.map((ratio) => (
                <Button
                  key={ratio.value}
                  variant="ghost"
                  size="sm"
                  onClick={() => setAspectRatio(ratio.value)}
                  className={`flex flex-col items-center gap-1 py-3 ${
                    aspectRatio === ratio.value
                      ? 'border border-[#ff00aa]/25 bg-[#ff00aa]/15 text-[#ffd6f5]'
                      : 'border border-white/10 bg-white/[0.03] text-white/60'
                  }`}
                >
                  {ratio.icon}
                  <span className="text-xs">{ratio.label}</span>
                </Button>
              ))}
            </div>
          </div>

          {/* Model Selection */}
          <div>
            <label className="text-sm text-white/70 mb-2 block">Model</label>
            <div className="grid grid-cols-2 gap-2">
              {IMAGE_MODELS.map((m) => (
                <Button
                  key={m.value}
                  variant="ghost"
                  size="sm"
                  onClick={() => setModel(m.value)}
                  className={`flex flex-col items-start p-3 h-auto ${
                    model === m.value
                      ? 'border border-[#7c3aed]/30 bg-[#7c3aed]/20 text-[#e2d4ff]'
                      : 'border border-white/10 bg-white/[0.03] text-white/60'
                  }`}
                >
                  <span className="font-medium">{m.label}</span>
                  <span className="text-xs opacity-60">{m.description}</span>
                </Button>
              ))}
            </div>
          </div>

          {/* Generate Button */}
          <Button
            onClick={generateImage}
            disabled={isGenerating || !prompt.trim()}
            className="w-full bg-gradient-to-r from-[#7c3aed] via-[#00f2ff] to-[#ff00aa] py-6 font-medium text-white shadow-[0_0_24px_rgba(0,242,255,0.2)] hover:brightness-110"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5 mr-2" />
                Generate Image
              </>
            )}
          </Button>

          {error && (
            <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-300 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Center Panel - Preview */}
        <div className="flex min-h-[380px] flex-col overflow-hidden">
          <div className="flex flex-1 items-center justify-center p-6 md:p-8">
            {selectedImage ? (
              <div className="relative max-w-full max-h-full">
                <img
                  src={selectedImage.url}
                  alt={selectedImage.prompt}
                  className="max-w-full max-h-[52vh] rounded-2xl border border-white/10 shadow-2xl"
                />
                <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 flex-wrap justify-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => downloadImage(selectedImage)}
                    className="border border-white/10 bg-[#0c021a]/75 text-white hover:bg-[#0c021a]"
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Download
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => copyImageUrl(selectedImage)}
                    className="border border-white/10 bg-[#0c021a]/75 text-white hover:bg-[#0c021a]"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 mr-1 text-green-400" />
                    ) : (
                      <Copy className="w-4 h-4 mr-1" />
                    )}
                    {copied ? 'Copied!' : 'Copy URL'}
                  </Button>
                  {onApplyToAvatar && (
                    <Button
                      size="sm"
                      onClick={() =>
                        onApplyToAvatar({
                          url: selectedImage.url,
                          type: 'image',
                          prompt: selectedImage.prompt,
                          model: selectedImage.model,
                        })
                      }
                      className="bg-gradient-to-r from-[#7c3aed] to-[#ff00aa] text-white hover:brightness-110"
                    >
                      <Sparkles className="w-4 h-4 mr-1" />
                      Set on Avatar
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center text-center text-white/40">
                <ImageIcon className="w-16 h-16 mb-4 opacity-50" />
                <p className="text-lg">No image selected</p>
                <p className="text-sm">
                  Generate an image or select from history
                </p>
              </div>
            )}
          </div>

          {/* Prompt info */}
          {selectedImage && (
            <div className="border-t border-white/10 bg-white/[0.03] p-4">
              <p className="text-sm text-white/70 mb-1">Prompt:</p>
              <p className="text-white">{selectedImage.prompt}</p>
              <div className="flex gap-2 mt-2">
                <Badge className="border-white/10 bg-white/[0.03] text-white/60">
                  {selectedImage.aspectRatio}
                </Badge>
                <Badge className="border-white/10 bg-white/[0.03] text-white/60">
                  {selectedImage.model}
                </Badge>
                <Badge className="border-white/10 bg-white/[0.03] text-white/60">
                  {selectedImage.timestamp.toLocaleTimeString()}
                </Badge>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel - History */}
        <div className="flex min-h-[220px] flex-col border-t border-white/10 bg-white/[0.03] xl:border-l xl:border-t-0">
          <div className="p-3 border-b border-white/10 flex items-center justify-between">
            <span className="text-sm text-white/70">History</span>
            {generatedImages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearHistory}
                className="h-6 px-2 text-xs text-red-400 hover:bg-red-500/20"
              >
                <Trash2 className="w-3 h-3 mr-1" />
                Clear
              </Button>
            )}
          </div>

          <ScrollArea className="flex-1 p-2">
            {generatedImages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-white/40 p-4 text-center">
                <Wand2 className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm">No images yet</p>
                <p className="text-xs">Generated images will appear here</p>
              </div>
            ) : (
              <div className="grid gap-2">
                {generatedImages.map((image) => (
                  <div
                    key={image.id}
                    className={`relative group cursor-pointer rounded-lg overflow-hidden border-2 transition-colors ${
                      selectedImage?.id === image.id
                        ? 'border-purple-500'
                        : 'border-transparent hover:border-white/20'
                    }`}
                    onClick={() => setSelectedImage(image)}
                  >
                    <img
                      src={image.url}
                      alt={image.prompt}
                      className="w-full aspect-square object-cover"
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteImage(image.id);
                        }}
                        className="text-red-400 hover:bg-red-500/20"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>
    </div>
  );
};

export default CreativeStudio;
