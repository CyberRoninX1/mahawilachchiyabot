import crypto from 'crypto';
import { default as makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import express from 'express';
import bodyParser from 'body-parser';
import qrcode from 'qrcode-terminal';

const app = express();
app.use(bodyParser.json());

let sock = null;
let isConnected = false;
let currentQR = null;

// Admin WhatsApp number
const ADMIN_NUMBER = '94789748241';

async function connectToWhatsApp() {
    console.log('📱 Starting WhatsApp connection...');
    
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
    
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        browser: ['Mahawilacchiya E-Shop', 'Chrome', '1.0.0'],
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        connectTimeoutMs: 60000
    });
    
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            currentQR = qr;
            console.log('\n🔐 QR CODE GENERATED!');
            console.log('📱 Open WhatsApp > Settings > Linked Devices > Link a Device\n');
        }
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log('🔄 Reconnecting in 5 seconds...');
                setTimeout(() => connectToWhatsApp(), 5000);
            } else {
                console.log('🔴 Logged out. Please restart.');
                isConnected = false;
            }
        } else if (connection === 'open') {
            isConnected = true;
            currentQR = null;
            console.log('\n✅✅✅ WHATSAPP CONNECTED! ✅✅✅\n');
        }
    });
    
    sock.ev.on('creds.update', saveCreds);
    
    // Handle incoming messages
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;
        
        let messageText = '';
        if (msg.message.conversation) {
            messageText = msg.message.conversation;
        } else if (msg.message.extendedTextMessage) {
            messageText = msg.message.extendedTextMessage.text;
        }
        
        const sender = msg.key.remoteJid;
        const senderName = msg.pushName || 'User';
        
        console.log(`📩 Received: "${messageText}" from ${senderName}`);
        
        if (messageText === '.status') {
            await sock.sendMessage(sender, { 
                text: `✅ Bot is connected!\nAdmin: ${ADMIN_NUMBER}\nTime: ${new Date().toLocaleString()}` 
            });
        }
    });
}

// ============ API ENDPOINTS ============

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        name: 'Mahawilacchiya E-Shop WhatsApp Bot',
        status: isConnected ? 'online' : 'offline',
        version: '1.0.0',
        endpoints: {
            health: 'GET /health',
            qr: 'GET /qr',
            send_otp: 'POST /send-whatsapp',
            pair: 'POST /pair'
        }
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: isConnected ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString()
    });
});

// QR code endpoint
app.get('/qr', (req, res) => {
    if (currentQR) {
        res.json({ 
            status: 'qr_ready',
            qr_url: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(currentQR)}`
        });
    } else if (isConnected) {
        res.json({ status: 'connected' });
    } else {
        res.json({ status: 'waiting' });
    }
});

// Send OTP endpoint
app.post('/send-whatsapp', async (req, res) => {
    const { phone, message } = req.body;
    
    console.log(`📨 Send OTP to: ${phone}`);
    
    if (!isConnected) {
        return res.status(503).json({ success: false, message: 'Bot not connected' });
    }
    
    try {
        let formattedNumber = phone.toString().trim().replace(/[^0-9]/g, '');
        if (formattedNumber.startsWith('0')) formattedNumber = '94' + formattedNumber.substring(1);
        if (!formattedNumber.startsWith('94')) formattedNumber = '94' + formattedNumber;
        
        await sock.sendMessage(formattedNumber + '@s.whatsapp.net', { text: message });
        console.log(`✅ OTP sent to ${phone}`);
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Generate pairing code endpoint
app.post('/pair', async (req, res) => {
    const { phone } = req.body;
    
    if (!phone) {
        return res.status(400).json({ success: false, message: 'Phone number required' });
    }
    
    if (!isConnected) {
        return res.status(503).json({ success: false, message: 'Bot not connected yet. Please wait...' });
    }
    
    try {
        let cleanPhone = phone.toString().trim().replace(/[^0-9]/g, '');
        if (cleanPhone.startsWith('0')) cleanPhone = '94' + cleanPhone.substring(1);
        if (!cleanPhone.startsWith('94')) cleanPhone = '94' + cleanPhone;
        
        const code = await sock.requestPairingCode(cleanPhone);
        
        res.json({ 
            success: true, 
            pairing_code: code,
            phone: cleanPhone,
            instructions: 'Open WhatsApp > Settings > Linked Devices > Link a Device, then enter this code'
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Bot running on http://0.0.0.0:${PORT}`);
    console.log(`📨 POST http://0.0.0.0:${PORT}/send-whatsapp`);
    console.log(`🔑 POST http://0.0.0.0:${PORT}/pair`);
    console.log(`🏥 GET http://0.0.0.0:${PORT}/health`);
    console.log(`🔐 GET http://0.0.0.0:${PORT}/qr`);
    console.log(`🏠 GET http://0.0.0.0:${PORT}/\n`);
    connectToWhatsApp();
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down...');
    if (sock) {
        await sock.logout();
    }
    process.exit(0);
});
