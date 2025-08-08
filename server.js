// server.js
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Generar UUID v4 simple (cliente y servidor podrían usar distinto, aquí solo servidor)
function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0,
          v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Historial con mensajes y reacciones
// Cada mensaje es { id, name, text, reactions: { heart: number } }
// Reacciones se agregan a ese objeto

app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>NachoChat</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
  /* Burbuja con posicion relativa para el corazon */
  .msg-bubble {
    position: relative;
  }
  .reaction-heart {
    position: absolute;
    bottom: 2px;
    right: 4px;
    font-size: 14px;
    user-select: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 2px;
    color: #f87171; /* rojo Tailwind */
  }
</style>
</head>
<body class="bg-gray-900 text-white flex items-center justify-center min-h-screen">
  <div class="flex flex-col w-full h-screen sm:h-[90vh] sm:max-w-lg bg-gray-800 rounded-none sm:rounded-xl shadow-lg overflow-hidden">

    <header class="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 p-4 text-center font-bold text-lg border-b border-gray-700">
      💬 NachoChat
    </header>

    <div id="chat" class="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-800"></div>

    <div class="p-3 border-t border-gray-700 bg-gray-900">
      <input id="name" class="w-full p-2 rounded bg-gray-700 text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Tu nombre (opcional)" />
    </div>

    <div class="p-3 flex space-x-2 border-t border-gray-700 bg-gray-900 items-center">
      <input id="msg" class="flex-1 p-2 rounded bg-gray-700 text-white placeholder-gray-300 focus:outline-none" placeholder="Escribe un mensaje..." autocomplete="off" />
      <button id="emoji-btn" class="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded text-white text-xl select-none">😀</button>
      <button id="send" class="bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded text-white font-semibold">Enviar</button>
    </div>

    <div id="emoji-picker" class="hidden absolute bg-gray-800 border border-gray-700 rounded p-2 flex space-x-2 bottom-20 right-6 z-50">
      <button class="emoji-btn text-xl">😀</button>
      <button class="emoji-btn text-xl">😂</button>
      <button class="emoji-btn text-xl">❤️</button>
      <button class="emoji-btn text-xl">👍</button>
      <button class="emoji-btn text-xl">🎉</button>
    </div>

  </div>

<script>
  const $ = id => document.getElementById(id);
  const chat = $('chat');
  const nameInput = $('name');
  const msgInput = $('msg');
  const sendBtn = $('send');
  const emojiBtn = $('emoji-btn');
  const emojiPicker = $('emoji-picker');

  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(protocol + '://' + location.host);

  // Guardar y recuperar nombre en localStorage
  nameInput.value = localStorage.getItem('chatName') || '';
  nameInput.addEventListener('input', () => {
    localStorage.setItem('chatName', nameInput.value.trim());
  });

  // Guardar mensajes en memoria local para no perder reacciones (si se recarga el chat)
  // Pero el historial completo viene del servidor.

  // Mapa de mensajes en DOM para actualizar reacciones (id => div.bubble)
  const messagesMap = new Map();

  function createMessageElement({ id, name, text, reactions }, isOwn) {
    const wrapper = document.createElement('div');
    wrapper.className = 'flex ' + (isOwn ? 'justify-end' : 'justify-start');

    const bubble = document.createElement('div');
    bubble.className = 'max-w-[80%] px-3 py-2 rounded-lg text-sm msg-bubble ' +
      (isOwn ? 'bg-blue-500 text-white rounded-br-none' : 'bg-gray-700 text-gray-100 rounded-bl-none');

    bubble.dataset.id = id;

    const strong = document.createElement('strong');
    strong.textContent = name + ': ';
    const span = document.createElement('span');
    span.textContent = text;

    bubble.appendChild(strong);
    bubble.appendChild(span);

    // Reaction heart container
    const reactionDiv = document.createElement('div');
    reactionDiv.className = 'reaction-heart';
    reactionDiv.title = 'Doble click para reaccionar con ❤️';
    updateReactionCount(reactionDiv, reactions?.heart || 0);
    bubble.appendChild(reactionDiv);

    // Doble clic para reaccionar
    bubble.addEventListener('dblclick', () => {
      sendReaction(id);
    });

    wrapper.appendChild(bubble);
    return wrapper;
  }

  function updateReactionCount(elem, count) {
    if(count > 0) {
      elem.innerHTML = '❤️ ' + count;
      elem.style.display = 'flex';
    } else {
      elem.innerHTML = '';
      elem.style.display = 'none';
    }
  }

  function addMsg(name, text, id, isOwn = false, reactions = {}) {
    const msgData = { id, name, text, reactions };
    const msgElem = createMessageElement(msgData, isOwn);
    chat.appendChild(msgElem);
    messagesMap.set(id, msgElem.querySelector('.msg-bubble .reaction-heart').parentElement.querySelector('.reaction-heart') || msgElem.querySelector('.reaction-heart'));
    // Scroll si estamos abajo
    const nearBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 100;
    if (nearBottom) chat.scrollTop = chat.scrollHeight;
  }

  // Enviar mensaje
  function sendMessage() {
    const name = nameInput.value.trim() || 'Anon';
    const text = msgInput.value.trim();
    if (!text) return;

    const id = crypto.randomUUID ? crypto.randomUUID() : generateFallbackUUID();

    // Mostrar localmente con ID y sin reacciones
    addMsg(name, text, id, true);

    // Enviar al servidor
    ws.send(JSON.stringify({ type: 'message', id, name, text }));

    msgInput.value = '';
    msgInput.focus();
  }

  // Enviar reacción ❤️
  function sendReaction(id) {
    ws.send(JSON.stringify({ type: 'reaction', id, emoji: 'heart' }));
  }

  // Recibir mensajes y reacciones
  ws.onmessage = async e => {
    let data = e.data;
    if (e.data instanceof Blob) data = await e.data.text();

    try {
      const parsed = JSON.parse(data);

      if (parsed.type === 'history') {
        // Recibir historial completo: mensajes y reacciones
        chat.innerHTML = '';
        messagesMap.clear();
        parsed.data.forEach(item => {
          if(item.type === 'message') {
            addMsg(item.name, item.text, item.id, false, item.reactions);
          } else if(item.type === 'reaction') {
            applyReaction(item.id, item.emoji);
          }
        });
        return;
      }

      if(parsed.type === 'message') {
        // Evitar mostrar mensaje local echo si ya se mostró
        if(messagesMap.has(parsed.id)) return;
        addMsg(parsed.name, parsed.text, parsed.id, false, parsed.reactions);
      } else if(parsed.type === 'reaction') {
        applyReaction(parsed.id, parsed.emoji);
      }

    } catch {
      // Mostrar texto simple si no es JSON
      addMsg('sistema', String(data), generateFallbackUUID(), false);
    }
  };

  // Aplicar reacción al mensaje en pantalla
  function applyReaction(id, emoji) {
    if(emoji !== 'heart') return; // por ahora solo ❤️
    // Buscar burbuja del mensaje
    for(const [msgId, elem] of messagesMap) {
      if(msgId === id) {
        // Actualizar contador
        let count = parseInt(elem.textContent.replace(/\D/g,'')) || 0;
        count++;
        updateReactionCount(elem, count);
        return;
      }
    }
  }

  // UUID fallback si no existe crypto.randomUUID (para navegadores antiguos)
  function generateFallbackUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0,
            v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // Toggle emoji picker
  emojiBtn.addEventListener('click', () => {
    emojiPicker.classList.toggle('hidden');
  });

  // Insertar emoji en input al click
  emojiPicker.querySelectorAll('.emoji-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      msgInput.value += btn.textContent;
      msgInput.focus();
      emojiPicker.classList.add('hidden');
    });
  });

  sendBtn.onclick = sendMessage;
  msgInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendMessage();
    }
  });
</script>
</body>
</html>
`);
});

// Servidor guarda mensajes y reacciones, mantiene historial

let history = []; 
// Estructura historial: array de items con:
// {type: 'message', id, name, text, reactions: { heart: number } }
// {type: 'reaction', id, emoji}

wss.on('connection', ws => {
  // Enviar historial completo al conectar
  ws.send(JSON.stringify({ type: 'history', data: history }));

  ws.on('message', data => {
    const str = typeof data === 'string' ? data : data.toString();

    try {
      const parsed = JSON.parse(str);

      if(parsed.type === 'message') {
        // Nuevo mensaje
        parsed.reactions = { heart: 0 };
        history.push(parsed);
        if(history.length > 200) history.shift();

        // Enviar a todos menos quien envió para evitar eco local
        for(const client of wss.clients) {
          if(client !== ws && client.readyState === 1) {
            client.send(JSON.stringify(parsed));
          }
        }

      } else if(parsed.type === 'reaction') {
        // Nueva reacción
        // Actualizar historial
        const msg = history.find(m => m.id === parsed.id);
        if(msg && parsed.emoji === 'heart') {
          msg.reactions.heart = (msg.reactions.heart || 0) + 1;
        }

        // Reenviar reacción a todos menos quien envió
        for(const client of wss.clients) {
          if(client !== ws && client.readyState === 1) {
            client.send(JSON.stringify(parsed));
          }
        }
      }
    } catch {}
  });
});

const PORT = process.env.PORT || 3000;
const HOST = process.argv[2] || '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log(`Servidor en http://${HOST}:${PORT}`);
});
