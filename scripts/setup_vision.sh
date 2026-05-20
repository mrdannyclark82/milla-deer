#!/usr/bin/env bash
# =============================================================================
# scripts/setup_vision.sh
# Milla-Rayne vision inference setup — llama.cpp (Vulkan/OpenVINO) +
# Qwen-2.5-VL-7B-Q4 + Phi-4-Multimodal-Q4 + ai-edge-torch for LiteRT
# =============================================================================
# Usage:
#   chmod +x scripts/setup_vision.sh
#   ./scripts/setup_vision.sh [--skip-models] [--backend vulkan|openvino|cpu]
# =============================================================================

set -euo pipefail

# ── Config ───────────────────────────────────────────────────────────────────

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VISION_DIR="${REPO_ROOT}/locallm/vision"
LLAMA_DIR="${VISION_DIR}/llama.cpp"
MODELS_DIR="${VISION_DIR}/models"
VENV="${REPO_ROOT}/venv"
BACKEND="${BACKEND:-vulkan}"   # vulkan | openvino | cpu
SKIP_MODELS=0

for arg in "$@"; do
  case $arg in
    --skip-models) SKIP_MODELS=1 ;;
    --backend=*) BACKEND="${arg#*=}" ;;
    --backend) shift; BACKEND="$1" ;;
  esac
done

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[setup_vision]${NC} $*"; }
warn()  { echo -e "${YELLOW}[setup_vision]${NC} $*"; }
error() { echo -e "${RED}[setup_vision]${NC} $*" >&2; }

mkdir -p "${VISION_DIR}" "${MODELS_DIR}"

# ── 1. System deps ────────────────────────────────────────────────────────────

info "Checking system dependencies..."
PKGS_NEEDED=()

for pkg in cmake ninja-build git curl wget python3 python3-venv; do
  command -v "${pkg%%-*}" &>/dev/null || PKGS_NEEDED+=("$pkg")
done

if [[ ${#PKGS_NEEDED[@]} -gt 0 ]]; then
  warn "Installing: ${PKGS_NEEDED[*]}"
  if command -v apt &>/dev/null; then
    sudo apt-get install -y "${PKGS_NEEDED[@]}"
  elif command -v pacman &>/dev/null; then
    sudo pacman -S --noconfirm "${PKGS_NEEDED[@]}"
  else
    error "Cannot auto-install deps — install manually: ${PKGS_NEEDED[*]}"
    exit 1
  fi
fi

# Vulkan SDK / drivers
if [[ "${BACKEND}" == "vulkan" ]]; then
  info "Checking Vulkan SDK..."
  if ! command -v vulkaninfo &>/dev/null; then
    warn "Vulkan tools not found — installing..."
    if command -v apt &>/dev/null; then
      sudo apt-get install -y libvulkan-dev vulkan-tools mesa-vulkan-drivers
    elif command -v pacman &>/dev/null; then
      sudo pacman -S --noconfirm vulkan-headers vulkan-tools mesa
    fi
  else
    info "Vulkan SDK OK ($(vulkaninfo 2>&1 | grep 'apiVersion' | head -1 | xargs))"
  fi
fi

# OpenVINO runtime
if [[ "${BACKEND}" == "openvino" ]]; then
  info "Checking OpenVINO runtime..."
  if ! python3 -c "import openvino" 2>/dev/null; then
    warn "Installing OpenVINO via pip..."
    "${VENV}/bin/pip" install --quiet openvino openvino-dev[pytorch]
  else
    info "OpenVINO OK"
  fi
fi

# ── 2. Clone / update llama.cpp ───────────────────────────────────────────────

if [[ -d "${LLAMA_DIR}/.git" ]]; then
  info "Updating llama.cpp..."
  git -C "${LLAMA_DIR}" pull --quiet --ff-only
else
  info "Cloning llama.cpp..."
  git clone --depth 1 https://github.com/ggml-org/llama.cpp.git "${LLAMA_DIR}"
fi

# ── 3. Build llama.cpp ────────────────────────────────────────────────────────

BUILD_DIR="${LLAMA_DIR}/build"
mkdir -p "${BUILD_DIR}"

CMAKE_ARGS=(
  -DCMAKE_BUILD_TYPE=Release
  -DLLAMA_NATIVE=ON
  -DLLAMA_BUILD_TESTS=OFF
  -DLLAMA_BUILD_EXAMPLES=ON
  -G Ninja
)

case "${BACKEND}" in
  vulkan)
    info "Building llama.cpp with Vulkan backend..."
    CMAKE_ARGS+=(-DGGML_VULKAN=ON)
    ;;
  openvino)
    info "Building llama.cpp with OpenVINO backend..."
    CMAKE_ARGS+=(-DLLAMA_OPENVINO=ON)
    ;;
  cpu)
    info "Building llama.cpp CPU-only (no GPU acceleration)..."
    ;;
  *)
    error "Unknown backend: ${BACKEND}. Use vulkan, openvino, or cpu."
    exit 1
    ;;
esac

cmake -S "${LLAMA_DIR}" -B "${BUILD_DIR}" "${CMAKE_ARGS[@]}" -Wno-dev
cmake --build "${BUILD_DIR}" --parallel "$(nproc)"

LLAMA_BIN="${BUILD_DIR}/bin"
info "llama.cpp built → ${LLAMA_BIN}"

# ── 4. Download GGUF models ───────────────────────────────────────────────────

if [[ ${SKIP_MODELS} -eq 1 ]]; then
  warn "--skip-models set — skipping model downloads"
else
  source "${VENV}/bin/activate"

  # Install huggingface_hub if needed
  python3 -c "import huggingface_hub" 2>/dev/null || pip install --quiet huggingface_hub

  info "Downloading Qwen-2.5-VL-7B-Q4_K_M..."
  QWEN_PATH="${MODELS_DIR}/qwen2.5-vl-7b-instruct-q4_k_m.gguf"
  if [[ ! -f "${QWEN_PATH}" ]]; then
    python3 - <<'PYEOF'
from huggingface_hub import hf_hub_download
import os
path = hf_hub_download(
    repo_id="Qwen/Qwen2.5-VL-7B-Instruct-GGUF",
    filename="qwen2.5-vl-7b-instruct-q4_k_m.gguf",
    local_dir=os.environ["MODELS_DIR"],
    token=os.environ.get("HF_TOKEN"),
)
print(f"[setup_vision] Qwen downloaded → {path}")
PYEOF
  else
    info "Qwen-2.5-VL-7B-Q4 already present — skipping"
  fi

  info "Downloading Phi-4-Multimodal-Q4_K_M..."
  PHI4_PATH="${MODELS_DIR}/phi-4-multimodal-q4_k_m.gguf"
  if [[ ! -f "${PHI4_PATH}" ]]; then
    python3 - <<'PYEOF'
from huggingface_hub import hf_hub_download
import os
# Note: adjust repo_id once Microsoft publishes official GGUF for Phi-4-Multimodal
path = hf_hub_download(
    repo_id="microsoft/Phi-4-multimodal-instruct-gguf",
    filename="phi-4-multimodal-q4_k_m.gguf",
    local_dir=os.environ["MODELS_DIR"],
    token=os.environ.get("HF_TOKEN"),
)
print(f"[setup_vision] Phi-4 downloaded → {path}")
PYEOF
  else
    info "Phi-4-Multimodal-Q4 already present — skipping"
  fi

  deactivate
fi

# ── 5. ai-edge-torch for LiteRT conversion ────────────────────────────────────

info "Installing ai-edge-torch for LiteRT/TFLite Gemma 3 conversion..."
"${VENV}/bin/pip" install --quiet "ai-edge-torch>=0.3" tensorflow

# ── 6. Write convenience launch scripts ──────────────────────────────────────

QWEN_SCRIPT="${VISION_DIR}/run_qwen_vl.sh"
cat > "${QWEN_SCRIPT}" <<LAUNCH
#!/usr/bin/env bash
# Run Qwen-2.5-VL-7B server on localhost:8081 (llama.cpp OpenAI-compatible)
set -euo pipefail
LLAMA_BIN="${LLAMA_BIN}"
MODEL="${MODELS_DIR}/qwen2.5-vl-7b-instruct-q4_k_m.gguf"
exec "\${LLAMA_BIN}/llama-server" \\
  --model "\${MODEL}" \\
  --port 8081 \\
  --ctx-size 4096 \\
  --n-gpu-layers 35 \\
  --threads "\$(nproc)" \\
  "\$@"
LAUNCH
chmod +x "${QWEN_SCRIPT}"

PHI4_SCRIPT="${VISION_DIR}/run_phi4_multimodal.sh"
cat > "${PHI4_SCRIPT}" <<LAUNCH
#!/usr/bin/env bash
# Run Phi-4-Multimodal server on localhost:8082 (llama.cpp OpenAI-compatible)
set -euo pipefail
LLAMA_BIN="${LLAMA_BIN}"
MODEL="${MODELS_DIR}/phi-4-multimodal-q4_k_m.gguf"
exec "\${LLAMA_BIN}/llama-server" \\
  --model "\${MODEL}" \\
  --port 8082 \\
  --ctx-size 4096 \\
  --n-gpu-layers 20 \\
  --threads "\$(nproc)" \\
  "\$@"
LAUNCH
chmod +x "${PHI4_SCRIPT}"

# ── 7. Summary ────────────────────────────────────────────────────────────────

info "============================================================"
info "Vision setup complete!"
info ""
info "  Backend:        ${BACKEND}"
info "  llama.cpp bin:  ${LLAMA_BIN}"
info "  Models dir:     ${MODELS_DIR}"
info ""
info "  Launch Qwen-2.5-VL-7B:    ${QWEN_SCRIPT}"
info "  Launch Phi-4-Multimodal:  ${PHI4_SCRIPT}"
info ""
info "  LiteRT pipeline: locallm/litert-pipeline.ts"
info "    import { runPipeline } from './locallm/litert-pipeline';"
info "    await runPipeline()  // downloads + converts Gemma 3 270M INT4"
info ""
info "  Vision API endpoints (server running):"
info "    POST /api/vision/analyze   — general VLM analysis"
info "    POST /api/vision/ground    — pixel-level element grounding"
info "============================================================"
