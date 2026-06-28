#!/bin/bash
# Entrypoint cho Python worker.
# Tự động tải SecLists vào /app/wordlists/seclists/ nếu chưa có,
# rồi khởi động worker chính.

set -e

WORDLIST_DIR="/app/wordlists"
SECLISTS_DIR="$WORDLIST_DIR/seclists"
ROCKYOU="$SECLISTS_DIR/Passwords/Leaked-Databases/rockyou.txt"
ROCKYOU_GZ="$SECLISTS_DIR/Passwords/Leaked-Databases/rockyou.txt.tar.gz"

mkdir -p "$WORDLIST_DIR"

# ── Tải SecLists nếu chưa có ──────────────────────────────
if [ ! -d "$SECLISTS_DIR" ]; then
    echo "[wordlist] SecLists chưa có — bắt đầu tải về (~500MB)..."
    cd "$WORDLIST_DIR"
    wget -q --show-progress -c \
        "https://github.com/danielmiessler/SecLists/archive/master.zip" \
        -O SecList.zip
    echo "[wordlist] Giải nén SecLists..."
    unzip -q SecList.zip
    rm -f SecList.zip
    mv SecLists-master seclists
    echo "[wordlist] ✓ SecLists đã sẵn sàng tại $SECLISTS_DIR"
else
    echo "[wordlist] ✓ SecLists đã có tại $SECLISTS_DIR — bỏ qua tải"
fi

# ── Giải nén rockyou.txt nếu chưa có ─────────────────────
if [ ! -f "$ROCKYOU" ] && [ -f "$ROCKYOU_GZ" ]; then
    echo "[wordlist] Giải nén rockyou.txt (~60MB)..."
    tar -xzf "$ROCKYOU_GZ" -C "$(dirname "$ROCKYOU_GZ")"
    echo "[wordlist] ✓ rockyou.txt ($(wc -l < "$ROCKYOU") dòng) sẵn sàng"
fi

# ── Khởi động worker ──────────────────────────────────────
exec python main.py
