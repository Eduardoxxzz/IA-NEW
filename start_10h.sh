#!/bin/bash

# 1. Impede o Android de matar o Termux
termux-wake-lock
echo "🔒 Wake-lock ativado."

# 2. Liga o servidor Node.js
cd ~/chat-ia
npm start > server.log 2>&1 &
SERVER_PID=$!
echo "🚀 Servidor Node.js iniciado."

# 3. Liga o Cloudflare com HTTP/2
cloudflared tunnel --protocol http2 --url http://localhost:3000 > cloudflared.log 2>&1 &
TUNNEL_PID=$!
echo "🌐 Túnel Cloudflare iniciado. Aguardando link..."

# Espera 5 segundos para pegar o link
sleep 5
echo "---------------------------------------------------"
echo "✅ SEU LINK ONLINE É:"
grep -o 'https://.*\.trycloudflare\.com' cloudflared.log | head -n 1
echo "---------------------------------------------------"

# Calcula 10 horas (10 * 3600 segundos)
SEGUNDOS_RESTANTES=36000
echo "⏳ O servidor vai desligar automaticamente em 10 horas."
echo "⚠️  VOCÊ PODE FECHAR A TELA DO CELULAR."
echo "Pressione Ctrl+C a qualquer momento para desligar antes."

# Espera 10 horas
sleep $SEGUNDOS_RESTANTES

# 4. Desliga tudo
echo "🛑 Tempo esgotado (10 horas)! Desligando..."
kill $SERVER_PID
kill $TUNNEL_PID
pkill -f node
pkill -f cloudflared
termux-wake-unlock
echo "💤 Servidor offline com sucesso."
