// server.js (único archivo)
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// HTML con Tailwind y diseño responsive + dark mode
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Chat</title>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-900 text-white flex items-center justify-center min-h-screen">
  <div class="flex flex-col w-full h-screen sm:h-[90vh] sm:max-w-lg bg-gray-800 rounded-none sm:rounded-xl shadow-lg overflow-hidden">

    <!-- Header -->
    <header class="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 p-4 text-center font-bold text-lg border-b border-gray-700">
      💬 Chat en tiempo real
    </header>

    <!-- Área de mensajes -->
    <div id="chat" class="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-800">
      <!-- Mensajes aquí -->
    </div>

    <!-- Campo de nombre -->
    <div class="p-3 border-t border-gray-700 bg-gray-900">
      <input id="name" class="w-full p-2 rounded bg-gray-700 text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Tu nombre (opcional)">
    </div>

    <!-- Barra de envío -->
    <div class="p-3 flex space-x-2 border-t border-gray-700 bg-gray-900">
      <input id="msg" class="flex-1 p-2 rounded bg-gray-700 text-white placeholder-gray-300 focus:outline-none" placeholder="Escribe un mensaje...">
      <button id="send" class="bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded text-white font-semibold">Enviar</button>
    </div>

  </div>

<script>
  const $ = id => document.getElementById(id);
  const chat = $('chat');
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(protocol + '://' + location.host);

  // Añadir mensaje al chat (burbuja)
  function addMsg(name, text, isOwn = false) {
    const wrapper = document.createElement('div');
    wrapper.className = 'flex ' + (isOwn ? 'justify-end' : 'justify-start');

    const bubble = document.createElement('div');
    bubble.className = 'max-w-[80%] px-3 py-2 rounded-lg text-sm ' +
      (isOwn ? 'bg-blue-500 text-white rounded-br-none' : 'bg-gray-700 text-gray-100 rounded-bl-none');

    const strong = document.createElement('strong');
    strong.textContent = name + ': ';
    const span = document.createElement('span');
    span.textContent = text;

    bubble.appendChild(strong);
    bubble.appendChild(span);

    wrapper.appendChild(bubble);
    chat.appendChild(wrapper);

    // Auto-scroll sólo si estamos cerca del final
    const nearBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 100;
    if (nearBottom) chat.scrollTop = chat.scrollHeight;
  }

  // Manejo de mensajes entrantes
  ws.onmessage = async e => {
    let data = e.data;
    if (e.data instanceof Blob) data = await e.data.text();

    try {
      const parsed = JSON.parse(data);

      // Historial inicial
      if (parsed.type === 'history') {
        parsed.data.forEach(msg => {
          try {
            const { name, text } = JSON.parse(msg);
            addMsg(name, text, false);
          } catch (err) {
            // ignorar si no se puede parsear
          }
        });
        return;
      }

      // Mensaje normal
      const { name, text } = parsed;
      // Evitar duplicados: si el mensaje tiene un flag _localEcho, lo ignoramos
      if (parsed._localEcho) return;
      addMsg(name, text, false);
    } catch (err) {
      // mensaje no JSON -> mostrar tal cual
      addMsg('sistema', String(data));
    }
  };

  // Enviar mensaje: mostramos localmente y lo enviamos al servidor
  function sendMessage() {
    const name = $('name').value.trim() || 'Anon';
    const text = $('msg').value.trim();
    if (!text) return;

    // Mostramos inmediatamente en cliente (evita sensación de latencia)
    addMsg(name, text, true);

    // Envío normal
    const payload = JSON.stringify({ name, text });
    ws.send(payload);

    $('msg').value = '';
    $('msg').focus();
  }

  $('send').onclick = sendMessage;
  $('msg').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendMessage();
    }
  });

</script>
</body>
</html>`);
});

// Historial en memoria (persistente solo mientras corre el servidor)
let history = [];

wss.on('connection', ws => {
  // Enviar historial al nuevo cliente
  ws.send(JSON.stringify({ type: 'history', data: history }));

  ws.on('message', data => {
    const message = typeof data === 'string' ? data : data.toString();

    // Guardar en historial
    history.push(message);
    if (history.length > 200) history.shift(); // últimos 200 mensajes

    // Reenviar a TODOS MENOS quien envió (evita duplicados locales)
    for (const client of wss.clients) {
      if (client !== ws && client.readyState === 1) {
        client.send(message);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
const HOST = process.argv[2] || '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log(`Servidor en http://${HOST}:${PORT}`);
});