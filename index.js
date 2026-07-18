// Edgetunnel VLESS Cloudflare Pages Script
// Pre-configured for UUID: 98c55779-609c-49ad-a7af-d4efa0813df4

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const userID = '98c55779-609c-49ad-a7af-d4efa0813df4'; 

      if (url.pathname === `/${userID}`) {
        return new Response(getVLESSConfigPage(url.host, userID), {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }

      const upgradeHeader = request.headers.get('Upgrade');
      if (upgradeHeader === 'websocket') {
        return await vlessOverWSHandler(request, userID);
      }

      return new Response(JSON.stringify({ status: "healthy", Subsystem: "VLESS-Edge-Pages" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    } catch (err) {
      return new Response(err.toString(), { status: 500 });
    }
  },
};

async function vlessOverWSHandler(request, userID) {
  const webSocketPair = new WebSocketPair();
  const client = webSocketPair[0];
  const server = webSocketPair[1];
  client.accept();

  let remoteSocketWrapper = null;

  client.addEventListener('message', async (event) => {
    try {
      const message = event.data;
      if (!remoteSocketWrapper) {
        if (message.byteLength < 24) return client.close();
        const view = new DataView(message);
        const version = view.getUint8(0);
        
        const id = Array.from(new Uint8Array(message.slice(1, 17)))
          .map(b => b.toString(16).padStart(2, '0')).join('');
        const formattedTargetUUID = `${id.slice(0,8)}-${id.slice(8,12)}-${id.slice(12,16)}-${id.slice(16,20)}-${id.slice(20)}`;
        
        if (formattedTargetUUID !== userID) return client.close();

        const targetPort = view.getUint16(17);
        const addressType = view.getUint8(19);
        let addressLength = 0;
        let addressStr = '';
        let addressBeginIndex = 20;

        if (addressType === 1) {
          addressLength = 4;
          addressStr = Array.from(new Uint8Array(message.slice(addressBeginIndex, addressBeginIndex + addressLength))).join('.');
        } else if (addressType === 2) {
          addressLength = view.getUint8(addressBeginIndex);
          addressBeginIndex += 1;
          addressStr = new TextDecoder().decode(message.slice(addressBeginIndex, addressBeginIndex + addressLength));
        }

        const rawDataIndex = addressBeginIndex + addressLength;
        const rawData = message.slice(rawDataIndex);

        // @ts-ignore
        const tcpSocket = connect({ hostname: addressStr, port: targetPort });
        remoteSocketWrapper = tcpSocket;

        const writer = tcpSocket.writable.getWriter();
        await writer.write(rawData);
        writer.releaseLock();

        tcpSocket.readable.pipeTo(new WritableStream({
          write(chunk) { client.send(chunk); },
          close() { client.close(); }
        })).catch(() => client.close());

      } else {
        const writer = remoteSocketWrapper.writable.getWriter();
        await writer.write(message);
        writer.releaseLock();
      }
    } catch (e) { client.close(); }
  });

  client.addEventListener('close', () => {
    try { if(remoteSocketWrapper) remoteSocketWrapper.close(); } catch(e) {}
  });

  return new Response(null, { status: 101, webSocket: server });
}

function getVLESSConfigPage(host, userID) {
  const vlessLink = `vless://${userID}@104.16.0.1:443?encryption=none&security=tls&sni=${host}&fp=randomized&type=ws&host=${host}&path=%2F#CF-Bypass-Node`;
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <title>Edgetunnel Config Panel</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      body { font-family: sans-serif; background-color: #1a1a2e; color: #fff; padding: 30px; text-align: center; }
      .container { background: #162447; padding: 30px; border-radius: 12px; max-width: 650px; margin: 0 auto; box-shadow: 0 8px 16px rgba(0,0,0,0.3); }
      textarea { width: 100%; height: 120px; background: #1a1a2e; color: #00fff5; border: 1px solid #0f4c81; padding: 12px; border-radius: 6px; font-family: monospace; }
    </style>
  </head>
  <body>
    <div class="container">
      <h2>🎉 VLESS Config සාර්ථකයි!</h2>
      <textarea readonly onclick="this.select()">${vlessLink}</textarea>
    </div>
  </body>
  </html>
  `;
}

