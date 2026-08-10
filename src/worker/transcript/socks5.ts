interface Socks5TunnelOptions {
  hostname: string;
  port: number;
  username: string;
  password: string;
}

const encoder = new TextEncoder();

class ByteReader {
  private buffered = new Uint8Array();

  constructor(private readonly reader: ReadableStreamDefaultReader<Uint8Array>) {}

  async readExactly(length: number): Promise<Uint8Array> {
    while (this.buffered.length < length) {
      const { done, value } = await this.reader.read();
      if (done) throw new Error("SOCKS5 代理响应提前结束");

      const combined = new Uint8Array(this.buffered.length + value.length);
      combined.set(this.buffered);
      combined.set(value, this.buffered.length);
      this.buffered = combined;
    }

    const result = this.buffered.slice(0, length);
    this.buffered = this.buffered.slice(length);
    return result;
  }
}

function encodeField(value: string, name: string): Uint8Array {
  const bytes = encoder.encode(value);
  if (bytes.length === 0 || bytes.length > 255) {
    throw new Error(`SOCKS5 ${name}长度必须在 1 到 255 字节之间`);
  }
  return bytes;
}

function buildAuthRequest(username: string, password: string): Uint8Array {
  const user = encodeField(username, "用户名");
  const pass = encodeField(password, "密码");
  return Uint8Array.of(0x01, user.length, ...user, pass.length, ...pass);
}

function buildConnectRequest(hostname: string, port: number): Uint8Array {
  const host = encodeField(hostname, "目标主机");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("SOCKS5 目标端口非法");
  }
  return Uint8Array.of(
    0x05,
    0x01,
    0x00,
    0x03,
    host.length,
    ...host,
    port >> 8,
    port & 0xff,
  );
}

async function consumeBoundAddress(reader: ByteReader, addressType: number): Promise<void> {
  if (addressType === 0x01) {
    await reader.readExactly(4 + 2);
    return;
  }
  if (addressType === 0x03) {
    const [length] = await reader.readExactly(1);
    await reader.readExactly(length + 2);
    return;
  }
  if (addressType === 0x04) {
    await reader.readExactly(16 + 2);
    return;
  }
  throw new Error(`SOCKS5 代理返回未知地址类型：${addressType}`);
}

export async function establishSocks5Tunnel(
  readable: ReadableStream<Uint8Array>,
  writable: WritableStream<Uint8Array>,
  options: Socks5TunnelOptions,
): Promise<void> {
  const streamReader = readable.getReader();
  const reader = new ByteReader(streamReader);
  const writer = writable.getWriter();

  try {
    await writer.write(Uint8Array.of(0x05, 0x01, 0x02));
    const method = await reader.readExactly(2);
    if (method[0] !== 0x05 || method[1] !== 0x02) {
      throw new Error("SOCKS5 代理不支持用户名密码认证");
    }

    await writer.write(buildAuthRequest(options.username, options.password));
    const authentication = await reader.readExactly(2);
    if (authentication[0] !== 0x01 || authentication[1] !== 0x00) {
      throw new Error("SOCKS5 代理认证失败");
    }

    await writer.write(buildConnectRequest(options.hostname, options.port));
    const connection = await reader.readExactly(4);
    if (connection[0] !== 0x05 || connection[2] !== 0x00) {
      throw new Error("SOCKS5 代理连接响应非法");
    }
    if (connection[1] !== 0x00) {
      throw new Error(`SOCKS5 代理连接目标失败：${connection[1]}`);
    }
    await consumeBoundAddress(reader, connection[3]);
  } finally {
    writer.releaseLock();
    streamReader.releaseLock();
  }
}
