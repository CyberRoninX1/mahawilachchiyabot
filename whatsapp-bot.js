const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const express = require('express');
const bodyParser = require('body-parser');
const qrcode = require('qrcode-terminal');

const app = express();
app.use(bodyParser.json());

let sock = null;
let isConnected = false;

async function connectToWhatsApp() {
    console.log('📱 Starting WhatsApp connection...');
    
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
    
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        browser: ['Mahawilacchiya Bot', 'Chrome', '1.0.0']
    });
    
    sock.ev.on('connection.update', (update) => {
        console.log('🔄 Update:', Object.keys(update));
        
        if (update.qr) {
            console.log('\n📱 QR CODE RECEIVED! Scan with WhatsApp:\n');
            qrcode.generate(update.qr, { small: true });
            console.log('\n');
        }
        
        if (update.connection === 'open') {
            isConnected = true;
            console.log('\n✅ CONNECTED! Bot is ready.\n');
        }
        
        if (update.connection === 'close') {
            isConnected = false;
            console.log('\n❌ Connection closed. Reconnecting in 5s...\n');
            setTimeout(connectToWhatsApp, 5000);
        }
    });
    
    sock.ev.on('creds.update', saveCreds);
}

app.post('/send-whatsapp', async (req, res) => {
    const { phone, message } = req.body;
    
    if (!isConnected) {
        return res.status(503).json({ success: false, message: 'Bot not connected' });
    }
    
    try {
        let formattedNumber = phone.toString().trim().replace(/[^0-9]/g, '');
        if (formattedNumber.startsWith('0')) formattedNumber = '94' + formattedNumber.substring(1);
        if (!formattedNumber.startsWith('94')) formattedNumber = '94' + formattedNumber;
        
        await sock.sendMessage(formattedNumber + '@s.whatsapp.net', { text: message });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: isConnected ? 'connected' : 'disconnected' });
});

app.get('/', (req, res) => {
    res.json({ status: isConnected ? 'online' : 'offline' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    connectToWhatsApp();
});
