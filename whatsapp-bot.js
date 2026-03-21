const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const bodyParser = require('body-parser');
const P = require('pino');
const qrcode = require('qrcode-terminal');

const app = express();
app.use(bodyParser.json());

let sock = null;
let isConnected = false;

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
    
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: P({ level: 'silent' })
    });
    
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('\n📱 SCAN QR CODE:\n');
            qrcode.generate(qr, { small: true });
            console.log('\nScan with WhatsApp > Linked Devices\n');
        }
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log('Reconnecting...');
                setTimeout(() => connectToWhatsApp(), 5000);
            }
        } else if (connection === 'open') {
            isConnected = true;
            console.log('\n✅ WhatsApp Bot Connected!\n');
        }
    });
    
    sock.ev.on('creds.update', saveCreds);
}

app.post('/send-whatsapp', async (req, res) => {
    const { phone, message } = req.body;
    
    if (!phone || !message) {
        return res.status(400).json({ success: false, message: 'Phone and message required' });
    }
    
    if (!isConnected) {
        return res.status(503).json({ success: false, message: 'Bot not connected' });
    }
    
    try {
        let formattedNumber = phone.toString().trim();
        formattedNumber = formattedNumber.replace(/[^0-9]/g, '');
        
        if (formattedNumber.startsWith('0')) {
            formattedNumber = '94' + formattedNumber.substring(1);
        }
        if (!formattedNumber.startsWith('94')) {
            formattedNumber = '94' + formattedNumber;
        }
        
        const whatsappId = formattedNumber + '@s.whatsapp.net';
        
        await sock.sendMessage(whatsappId, { text: message });
        
        res.json({ success: true, message: 'OTP sent' });
        
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: isConnected ? 'connected' : 'disconnected' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Bot API running on port ${PORT}`);
    connectToWhatsApp();
});
