const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const express = require('express');
const bodyParser = require('body-parser');
const qrcode = require('qrcode-terminal');

const app = express();
app.use(bodyParser.json());

let sock = null;
let isConnected = false;
let currentQR = null;

async function connectToWhatsApp() {
    console.log('📱 Starting WhatsApp connection...');
    
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
    
    sock = makeWASocket({
        auth: state,
        browser: ['Mahawilacchiya Bot', 'Chrome', '1.0.0']
    });
    
    sock.ev.on('connection.update', (update) => {
        console.log('🔄 Update received with keys:', Object.keys(update));
        
        // QR CODE - THIS IS WHAT WE NEED!
        if (update.qr) {
            currentQR = update.qr;
            console.log('\n🔐 QR CODE GENERATED!');
            console.log('====================================');
            console.log('📱 SCAN THIS QR CODE WITH WHATSAPP:');
            console.log('====================================');
            
            // Display QR in terminal
            qrcode.generate(update.qr, { small: true });
            
            // Also provide URL for browser
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(update.qr)}`;
            console.log(`\n🌐 Or visit this URL to see QR code: ${qrUrl}\n`);
            console.log('====================================\n');
        }
        
        if (update.connection === 'open') {
            isConnected = true;
            currentQR = null;
            console.log('\n✅✅✅ WHATSAPP CONNECTED SUCCESSFULLY! ✅✅✅\n');
            console.log('🎉 Your bot is now ready to send OTP messages!\n');
        }
        
        if (update.connection === 'close') {
            isConnected = false;
            console.log('\n❌ Connection closed. Reconnecting in 5s...\n');
            setTimeout(connectToWhatsApp, 5000);
        }
    });
    
    sock.ev.on('creds.update', () => {
        console.log('📀 Credentials updated - saved to disk');
        saveCreds();
    });
}

// Endpoint to get QR code
app.get('/qr', (req, res) => {
    if (currentQR) {
        res.json({
            status: 'qr_ready',
            qr_url: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(currentQR)}`,
            instructions: 'Open WhatsApp > Settings > Linked Devices > Link a Device, then scan the QR code'
        });
    } else if (isConnected) {
        res.json({ status: 'connected', message: 'Bot is already connected to WhatsApp' });
    } else {
        res.json({ status: 'waiting', message: 'Waiting for QR code to be generated...' });
    }
});

app.post('/send-whatsapp', async (req, res) => {
    const { phone, message } = req.body;
    
    if (!isConnected) {
        return res.status(503).json({ success: false, message: 'Bot not connected to WhatsApp' });
    }
    
    try {
        let formattedNumber = phone.toString().trim().replace(/[^0-9]/g, '');
        if (formattedNumber.startsWith('0')) formattedNumber = '94' + formattedNumber.substring(1);
        if (!formattedNumber.startsWith('94')) formattedNumber = '94' + formattedNumber;
        
        await sock.sendMessage(formattedNumber + '@s.whatsapp.net', { text: message });
        console.log(`✅ OTP sent to ${phone}`);
        res.json({ success: true, message: 'OTP sent' });
    } catch (error) {
        console.error('❌ Send error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/health', (req, res) => {
    res.json({ 
        status: isConnected ? 'connected' : 'disconnected',
        qr_available: !!currentQR,
        timestamp: new Date().toISOString()
    });
});

app.get('/', (req, res) => {
    res.json({
        name: 'Mahawilacchiya E-Shop WhatsApp Bot',
        status: isConnected ? 'online' : 'offline',
        qr_available: !!currentQR,
        endpoints: {
            send_otp: 'POST /send-whatsapp',
            qr: 'GET /qr',
            health: 'GET /health'
        }
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n🚀 WhatsApp Bot API running on port ${PORT}`);
    console.log(`📱 QR Code endpoint: GET http://localhost:${PORT}/qr`);
    console.log(`🏥 Health check: GET http://localhost:${PORT}/health\n`);
    connectToWhatsApp();
});
