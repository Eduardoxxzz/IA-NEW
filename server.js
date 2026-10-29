import express from 'express';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(express.json({ limit: '50mb' }));

app.use((req, res, next) => {
  const arquivosBloqueados = ['/server.js', '/package.json', '/package-lock.json', '/.env', '/.gitignore', '/start_10h.sh'];
  if (arquivosBloqueados.includes(req.path)) return res.status(403).send('Acesso negado.');
  next();
});

app.use(express.static('.'));

const usuariosAtivos = new Map();
setInterval(() => {
  const agora = Date.now();
  for (const [ip, dados] of usuariosAtivos.entries()) {
    if (agora - dados.ultimoSinal > 60000) usuariosAtivos.delete(ip);
  }
}, 10000);

app.post('/api/heartbeat', async (req, res) => {
  let ip = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const dispositivo = req.headers['user-agent'] || 'Desconhecido';
  let estado = 'Local (Você)';

  if (!ip.includes('127.0.0.1') && !ip.includes('::1')) {
    if (!usuariosAtivos.has(ip)) {
      try {
        let ipLimpo = ip.replace('::ffff:', '');
        const locResposta = await fetch(`http://ip-api.com/json/${ipLimpo}?fields=status,regionName`);
        const locDados = await locResposta.json();
        if (locDados.status === 'success' && locDados.regionName) estado = locDados.regionName;
      } catch (e) { estado = 'Desconhecido'; }
    } else {
      estado = usuariosAtivos.get(ip).estado;
    }
  }
  
  usuariosAtivos.set(ip, { ultimoSinal: Date.now(), dispositivo, ip, estado });
  res.json({ sucesso: true });
});

app.get('/api/estatisticas', (req, res) => {
  const listaUsuarios = Array.from(usuariosAtivos.values()).map(u => ({
    ip: u.ip,
    estado: u.estado,
    dispositivo: u.dispositivo.substring(0, 45) + '...',
    ultimoSinal: Math.floor((Date.now() - u.ultimoSinal) / 1000) + 's atrás'
  }));
  res.json({ totalAtivos: usuariosAtivos.size, usuarios: listaUsuarios });
});

// ================= CHAT =================
const API_KEY = process.env.GROQ_API_KEY;
const PORT = process.env.PORT || 3000;

app.post('/api/chat', async (req, res) => {
  const { mensagens, arquivoConteudo, arquivoTipo, modo } = req.body;

  if (!mensagens || !Array.isArray(mensagens)) return res.status(400).json({ erro: 'Formato inválido' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    let mensagensFormatadas = [...mensagens];
    const isImage = arquivoTipo && arquivoTipo.startsWith('image/');
    
    if (arquivoConteudo) {
      const ultimaMsg = mensagensFormatadas.pop();
      if (isImage) {
        mensagensFormatadas.push({
          role: 'user',
          content: [
            { type: 'text', text: ultimaMsg.content },
            { type: 'image_url', image_url: { url: arquivoConteudo } }
          ]
        });
      } else {
        mensagensFormatadas.push({
          role: 'user',
          content: `${ultimaMsg.content}\n\n[Conteúdo do arquivo anexado]:\n\`\`\`\n${arquivoConteudo}\n\`\`\``
        });
      }
    }

    let modeloEscolhido = 'qwen/qwen3.8-27b';
    let promptSistema = `Você é um assistente analítico e objetivo. 
EVITE textos longos desnecessários. Seja direto, utilize tópicos em bullet points e divida as explicações em partes curtas e legíveis.`;
    let temp = 0.5;

    // 🌟 CORREÇÃO AQUI: Se for modo Pro, aceita texto/código (só bloqueia se for imagem)
    if (modo === 'pro' && !isImage) {
      modeloEscolhido = 'openai/gpt-oss-120b'; 
      temp = 0.2; 
      promptSistema = `Você é um Engenheiro de Software Sênior. 
- Analise os códigos enviados identificando falhas de forma cirúrgica.
- Não escreva textos longos de introdução. Vá direto à solução.
- Utilize blocos de código Markdown limpos e bem comentados.`;
    }

    const resposta = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: modeloEscolhido,
        messages: [
          { role: 'system', content: promptSistema },
          ...mensagensFormatadas
        ],
        stream: true,
        temperature: temp,
        max_tokens: 1500
      })
    });

    if (!resposta.ok) {
      const erro = await resposta.text();
      res.write(`data: ${JSON.stringify({ erro })}\n\n`);
      return res.end();
    }

    const reader = resposta.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const linhas = buffer.split('\n');
      buffer = linhas.pop();

      for (const linha of linhas) {
        if (!linha.startsWith('data: ')) continue;
        const dados = linha.slice(6).trim();
        if (dados === '[DONE]') continue;
        try {
          const json = JSON.parse(dados);
          const pedaco = json.choices?.[0]?.delta?.content;
          if (pedaco) res.write(`data: ${JSON.stringify({ pedaco })}\n\n`);
        } catch (e) {}
      }
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (erro) {
    res.write(`data: ${JSON.stringify({ erro: 'Falha ao conectar' })}\n\n`);
    res.end();
  }
});

app.listen(PORT, () => console.log(`✅ Chat IA rodando em http://localhost:${PORT}`));
