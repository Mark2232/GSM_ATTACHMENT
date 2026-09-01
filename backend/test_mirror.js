const net = require('net');

function rawGet(ip, path) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    const auth = Buffer.from('admin:admin').toString('base64');
    let res = '';
    client.connect(80, ip, () => {
      client.write(`GET ${path} HTTP/1.0\r\nHost: ${ip}\r\nAuthorization: Basic ${auth}\r\nConnection: close\r\n\r\n`);
    });
    client.on('data', d => res += d.toString('utf8'));
    client.on('end', () => resolve(res));
    client.on('error', err => reject(err));
  });
}

function rawPost(ip, path, body) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    const auth = Buffer.from('admin:admin').toString('base64');
    let res = '';
    client.connect(80, ip, () => {
      const req = `POST ${path} HTTP/1.0\r\n` +
        `Host: ${ip}\r\n` +
        `Authorization: Basic ${auth}\r\n` +
        `Content-Type: application/x-www-form-urlencoded\r\n` +
        `Content-Length: ${Buffer.byteLength(body)}\r\n` +
        `Connection: close\r\n\r\n` +
        body;
      client.write(req);
    });
    client.on('data', d => res += d.toString('utf8'));
    client.on('end', () => resolve(res));
    client.on('error', err => reject(err));
  });
}

async function run() {
  console.log('1. Fetching tools.html to get smskey...');
  const toolsHtml = await rawGet('192.168.8.190', '/default/en_US/tools.html?type=sms&line=');
  const keyMatch = toolsHtml.match(/name="smskey"\s+value="([^"]+)"/i) || toolsHtml.match(/smskey.*?value="([^"]+)"/i);
  const smskey = keyMatch ? keyMatch[1] : '';
  console.log('Extracted smskey:', smskey);

  const phone = '09973781381';
  const msg = 'Test SMS from mirror engine';
  const body = `line1=1&action=SMS&smskey=${smskey}&telnum=${encodeURIComponent(phone)}&smscontent=${encodeURIComponent(msg)}&send=Send`;

  console.log('2. Posting exact form body to /default/en_US/sms_info.html?type=sms...');
  const postRes = await rawPost('192.168.8.190', '/default/en_US/sms_info.html?type=sms', body);
  console.log('POST RESULT:\n', postRes);
}

run();
