const form = document.getElementById('form');
const input = document.getElementById('input');
const mensagensEl = document.getElementById('mensagens');
const limpar = document.getElementById('limpar');
const enviarBtn = document.getElementById('enviar');
const modoSelect = document.getElementById('modo-ia');

const btnArquivo = document.getElementById('btn-arquivo');
const arquivoInput = document.getElementById('arquivo');
const previewContainer = document.getElementById('preview-container');
const imgPreview = document.getElementById('img-preview');
const filePreview = document.getElementById('file-preview');
const fileName = document.getElementById('file-name');
const removerArquivoBtn = document.getElementById('remover-arquivo');

let historico = [];
let enviando = false;
let arquivoDados = null;
let arquivoTipo = null;

modoSelect.addEventListener('change', () => {
  if (modoSelect.value === 'pro') {
    input.placeholder = "Cole seu código ou anexe um arquivo...";
    input.style.fontFamily = 'monospace';
  } else {
    input.placeholder = "Digite sua mensagem...";
    input.style.fontFamily = 'Inter, sans-serif';
  }
});

btnArquivo.addEventListener('click', () => arquivoInput.click());
arquivoInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  arquivoTipo = file.type;
  const reader = new FileReader();

  reader.onload = (event) => {
    arquivoDados = event.target.result;
    if (arquivoTipo.startsWith('image/')) {
      imgPreview.src = arquivoDados;
      imgPreview.style.display = 'block';
      filePreview.style.display = 'none';
    } else {
      fileName.textContent = file.name;
      imgPreview.style.display = 'none';
      filePreview.style.display = 'flex';
    }
    previewContainer.style.display = 'flex';
  };

  if (file.type.startsWith('image/')) {
    reader.readAsDataURL(file);
  } else {
    reader.readAsText(file); 
  }
});

function limparArquivo() {
  arquivoDados = null;
  arquivoTipo = null;
  arquivoInput.value = '';
  previewContainer.style.display = 'none';
  imgPreview.src = '';
}

removerArquivoBtn.addEventListener('click', limparArquivo);

function adicionarBotoesCopiar(balao) {
  const blocosCodigo = balao.querySelectorAll('pre');
  blocosCodigo.forEach((pre) => {
    if (pre.querySelector('.btn-copiar')) return;

    const botao = document.createElement('button');
    botao.className = 'btn-copiar';
    botao.textContent = 'Copiar';
    
    botao.addEventListener('click', () => {
      const codigo = pre.querySelector('code').textContent;
      navigator.clipboard.writeText(codigo);
      botao.textContent = 'Copiado!';
      setTimeout(() => { botao.textContent = 'Copiar'; }, 2000);
    });

    pre.style.position = 'relative';
    pre.appendChild(botao);
  });
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (enviando) return;

  const texto = input.value.trim();
  if (!texto && !arquivoDados) return;

  const arquivoEnviado = arquivoDados;
  const tipoEnviado = arquivoTipo;
  const modoAtual = modoSelect.value;

  input.value = '';
  input.style.height = 'auto';
  limparArquivo();
  
  enviando = true;
  enviarBtn.disabled = true;

  adicionarMensagem(texto || "Analise este arquivo.", 'usuario');
  historico.push({ role: 'user', content: texto || "Analise este arquivo." });

  if (historico.length > 10) historico = historico.slice(-10);

  const balaoIA = adicionarMensagem('', 'ia');
  balaoIA.classList.add('digitando');

  try {
    const resposta = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        mensagens: historico,
        arquivoConteudo: arquivoEnviado,
        arquivoTipo: tipoEnviado,
        modo: modoAtual
      })
    });

    if (!resposta.ok) throw new Error('Erro na API');

    const reader = resposta.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let textoCompleto = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const linhas = buffer.split('\n\n');
      buffer = linhas.pop();

      for (const linha of linhas) {
        if (!linha.startsWith('data: ')) continue;
        const dados = linha.slice(6).trim();
        if (dados === '[DONE]') continue;
        try {
          const json = JSON.parse(dados);
          if (json.pedaco) {
            textoCompleto += json.pedaco;
            balaoIA.innerHTML = marked.parse(textoCompleto);
            adicionarBotoesCopiar(balaoIA);
            mensagensEl.scrollTop = mensagensEl.scrollHeight;
          }
          if (json.erro) balaoIA.textContent = '❌ ' + json.erro;
        } catch {}
      }
    }

    balaoIA.classList.remove('digitando');
    historico.push({ role: 'assistant', content: textoCompleto });
    if (historico.length > 10) historico = historico.slice(-10);

  } catch (erro) {
    balaoIA.classList.remove('digitando');
    balaoIA.textContent = '❌ Erro ao conectar.';
  } finally {
    enviando = false;
    enviarBtn.disabled = false;
    input.focus();
  }
});

function adicionarMensagem(texto, tipo) {
  const div = document.createElement('div');
  div.className = `mensagem ${tipo}`;
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = tipo === 'ia' ? '🤖' : '👤'; 
  const balao = document.createElement('div');
  balao.className = 'balao';
  
  if (texto) {
    if (tipo === 'usuario') {
      balao.textContent = texto;
      balao.style.whiteSpace = 'pre-wrap';
    } else {
      balao.innerHTML = marked.parse(texto);
      adicionarBotoesCopiar(balao);
    }
  }
  div.appendChild(avatar);
  div.appendChild(balao);
  mensagensEl.appendChild(div);
  mensagensEl.scrollTop = mensagensEl.scrollHeight;
  return balao;
}

limpar.addEventListener('click', () => {
  historico = [];
  mensagensEl.innerHTML = '';
  adicionarMensagem('Olá! Mude o seletor no topo para <b>Modo Dev</b> se quiser que eu analise códigos!', 'ia');
  input.focus();
});

input.focus();

function enviarSinalDeVida() { fetch('/api/heartbeat', { method: 'POST' }).catch(() => {}); }
enviarSinalDeVida(); 
setInterval(enviarSinalDeVida, 30000); 
