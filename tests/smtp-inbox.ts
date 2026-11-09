import { createServer } from "node:net";

// Test-only loopback SMTP receiver. No relay, credentials or external delivery.
export function smtpInbox(port: number) {
  const messages: string[] = [];
  let rejectDelivery = false;
  let rejected = 0;
  const server = createServer((socket) => {
    socket.setEncoding("utf8");
    socket.write("220 localhost test SMTP\r\n");
    let buffer = "",
      data = false;
    socket.on("data", (chunk) => {
      buffer += chunk;
      while (true) {
        if (data) {
          const end = buffer.indexOf("\r\n.\r\n");
          if (end < 0) return;
          const raw = buffer.slice(0, end);
          buffer = buffer.slice(end + 5);
          data = false;
          if (rejectDelivery) {
            rejected++;
            socket.write("550 Delivery rejected by test receiver\r\n");
            continue;
          }
          const split = raw.indexOf("\r\n\r\n");
          const headers = raw.slice(0, split);
          let body = raw.slice(split + 4);
          if (/Content-Transfer-Encoding: base64/i.test(headers))
            body = Buffer.from(body.replace(/\s/g, ""), "base64").toString(
              "utf8",
            );
          else if (/Content-Transfer-Encoding: quoted-printable/i.test(headers))
            body = body
              .replace(/=\r\n/g, "")
              .replace(/=([A-F0-9]{2})/g, (_, hex) =>
                String.fromCharCode(parseInt(hex, 16)),
              );
          messages.push(body);
          socket.write("250 queued locally\r\n");
        } else {
          const end = buffer.indexOf("\r\n");
          if (end < 0) return;
          const line = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          if (/^EHLO|^HELO/.test(line)) socket.write("250 localhost\r\n");
          else if (line === "DATA") {
            data = true;
            socket.write("354 End with dot\r\n");
          } else if (line === "QUIT") {
            socket.end("221 bye\r\n");
            return;
          } else socket.write("250 OK\r\n");
        }
      }
    });
  });
  return {
    messages,
    setRejectDelivery: (value: boolean) => {
      rejectDelivery = value;
    },
    rejectedCount: () => rejected,
    server,
    start: () =>
      new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve)),
  };
}
