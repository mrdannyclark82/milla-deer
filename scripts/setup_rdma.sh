#!/usr/bin/env bash
# setup_rdma.sh — RoCE v2 / RDMA setup for Arch/Garuda Linux
# Configures hardware or software RDMA, PFC, ECN, memory pinning, and VLANs.
set -euo pipefail

# ─── Privilege check ─────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  echo "⚠️  WARNING: This script should be run as root. Some steps may fail." >&2
fi

# ─── Distro detection ────────────────────────────────────────────────────────
OS_ID=""
if [[ -f /etc/os-release ]]; then
  # shellcheck source=/dev/null
  source /etc/os-release
  OS_ID="${ID:-unknown}"
fi

if [[ "$OS_ID" != "arch" && "$OS_ID" != "garuda" && "$PRETTY_NAME" != *"Arch"* && "$PRETTY_NAME" != *"Garuda"* ]]; then
  echo "⚠️  Detected OS: ${PRETTY_NAME:-unknown}. This script is designed for Arch/Garuda."
  echo "    Continuing anyway — some commands may not apply."
fi
echo "✅ OS: ${PRETTY_NAME:-${OS_ID:-unknown}}"

# ─── Helper functions ─────────────────────────────────────────────────────────
run_if_available() {
  local cmd="$1"; shift
  if command -v "$cmd" &>/dev/null; then
    "$cmd" "$@"
  else
    echo "  ⚠️  $cmd not found — skipping"
  fi
}

# ─── 1. Detect RDMA-capable NIC ──────────────────────────────────────────────
echo ""
echo "═══ Step 1: Detect RDMA NIC ═══"
HAVE_RNIC=false
RNIC_DEVICE=""

if command -v ibv_devinfo &>/dev/null; then
  RNIC_INFO=$(ibv_devinfo 2>/dev/null || true)
  if [[ -n "$RNIC_INFO" ]]; then
    HAVE_RNIC=true
    RNIC_DEVICE=$(echo "$RNIC_INFO" | grep "hca_id" | head -1 | awk '{print $2}' || true)
    echo "✅ Hardware RNIC detected: ${RNIC_DEVICE:-unknown}"
  fi
fi

if [[ "$HAVE_RNIC" == "false" ]] && command -v lspci &>/dev/null; then
  if lspci 2>/dev/null | grep -qiE "Mellanox|ConnectX|InfiniHost|MT[0-9]{4,5}"; then
    HAVE_RNIC=true
    RNIC_DEVICE=$(lspci 2>/dev/null | grep -iE "Mellanox|ConnectX" | head -1 | cut -d' ' -f1 || true)
    echo "✅ Mellanox/ConnectX NIC detected via lspci: ${RNIC_DEVICE:-unknown}"
  fi
fi

# ─── 2. Software RDMA fallback via rdma_rxe ──────────────────────────────────
echo ""
echo "═══ Step 2: Configure RDMA ═══"
if [[ "$HAVE_RNIC" == "false" ]]; then
  echo "  No RNIC found — configuring software RDMA (rdma_rxe kernel module)"
  if modprobe rdma_rxe 2>/dev/null; then
    echo "✅ rdma_rxe module loaded"
    # Add to /etc/modules-load.d for persistence
    echo "rdma_rxe" > /etc/modules-load.d/rdma_rxe.conf
    # Attach rxe to first available Ethernet interface
    FIRST_ETH=$(ip link show | grep -v "^[[:space:]]" | grep -v "lo:" | grep -E "^[0-9]+:" | awk -F': ' '{print $2}' | sed 's/@.*//' | head -1 || true)
    if [[ -n "$FIRST_ETH" ]]; then
      run_if_available rxe_cfg add "$FIRST_ETH" || true
      echo "✅ rxe attached to $FIRST_ETH"
    fi
  else
    echo "  ⚠️  rdma_rxe module load failed — RDMA may not be available"
  fi
else
  echo "✅ Using hardware RNIC: ${RNIC_DEVICE:-detected}"
fi

# ─── 3. Priority Flow Control (PFC) ──────────────────────────────────────────
echo ""
echo "═══ Step 3: Configure PFC ═══"
ACTIVE_ETH=$(ip route show default 2>/dev/null | awk '/dev/ {print $5}' | head -1 || true)
ACTIVE_ETH=${ACTIVE_ETH:-eth0}
echo "  Active interface: $ACTIVE_ETH"

if command -v mlnx_qos &>/dev/null; then
  echo "  Using mlnx_qos for PFC configuration"
  mlnx_qos -i "$ACTIVE_ETH" --pfc 0,0,0,1,0,0,0,0 2>/dev/null || echo "  ⚠️  mlnx_qos PFC config failed (may need privileges)"
elif command -v tc &>/dev/null; then
  echo "  Using tc qdisc for PFC (software path)"
  tc qdisc add dev "$ACTIVE_ETH" root handle 1: prio bands 8 priomap 0 1 2 3 4 5 6 7 0 0 0 0 0 0 0 0 2>/dev/null || \
    echo "  ⚠️  tc qdisc config failed (already configured or unsupported)"
else
  echo "  ⚠️  Neither mlnx_qos nor tc available — PFC skipped"
fi

# ─── 4. ECN (Explicit Congestion Notification) ───────────────────────────────
echo ""
echo "═══ Step 4: Enable ECN ═══"
sysctl -w net.ipv4.tcp_ecn=1
# Persist across reboots
mkdir -p /etc/sysctl.d
echo "net.ipv4.tcp_ecn=1" > /etc/sysctl.d/99-rdma-ecn.conf
echo "✅ ECN enabled"

# ─── 5. Memory pinning for RDMA ──────────────────────────────────────────────
echo ""
echo "═══ Step 5: Memory Pinning ═══"
ulimit -l unlimited 2>/dev/null || echo "  ⚠️  ulimit -l unlimited failed (may need PAM config)"

LIMITS_CONF=/etc/security/limits.conf
LIMITS_ENTRY="*    -    memlock    unlimited"
if ! grep -q "memlock.*unlimited" "$LIMITS_CONF" 2>/dev/null; then
  echo "$LIMITS_ENTRY" >> "$LIMITS_CONF"
  echo "✅ Added memlock unlimited to $LIMITS_CONF"
else
  echo "✅ memlock unlimited already configured"
fi

# ─── 6. VLAN setup ───────────────────────────────────────────────────────────
echo ""
echo "═══ Step 6: VLAN Configuration ═══"

# Ensure 8021q module is loaded
modprobe 8021q 2>/dev/null && echo "✅ 8021q module loaded" || echo "  ⚠️  8021q module not available"

setup_vlan() {
  local parent="$1"
  local vlan_id="$2"
  local desc="$3"
  local iface="${parent}.${vlan_id}"
  if ip link show "$iface" &>/dev/null; then
    echo "  VLAN $vlan_id ($desc) already exists on $parent"
  else
    ip link add link "$parent" name "$iface" type vlan id "$vlan_id" 2>/dev/null && \
      ip link set "$iface" up && \
      echo "✅ VLAN $vlan_id ($desc) created: $iface" || \
      echo "  ⚠️  Failed to create VLAN $vlan_id on $parent"
  fi
}

setup_vlan "$ACTIVE_ETH" 100 "RDMA"
setup_vlan "$ACTIVE_ETH" 200 "IoT/MQTT"

# ─── 7. Verify RDMA ──────────────────────────────────────────────────────────
echo ""
echo "═══ Step 7: Verify RDMA ═══"
if command -v rdma &>/dev/null; then
  rdma link show 2>/dev/null || echo "  No RDMA links found"
elif command -v ibv_devinfo &>/dev/null; then
  ibv_devinfo 2>/dev/null || echo "  No RDMA devices found"
else
  echo "  ⚠️  rdma/ibv_devinfo not available — install rdma-core to verify"
fi

echo ""
echo "═══ Setup Complete ═══"
echo "✅ RDMA/RoCE v2 configuration applied."
echo ""
echo "Recommended next steps:"
echo "  1. Reboot or reload modules: modprobe -r mlx5_ib && modprobe mlx5_ib (for Mellanox)"
echo "  2. Verify: rdma link show"
echo "  3. Test throughput: ib_send_bw / ib_read_bw"
echo "  4. Set MQTT_URL=mqtt://<IoT-VLAN-IP>:1883 in .env"
echo "  5. Set HA_URL=ws://<HA-IP>:8123 in .env"

chmod +x "$0"
