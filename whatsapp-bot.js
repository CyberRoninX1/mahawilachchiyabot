const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const bodyParser = require('body-parser');
const P = require('pino');
const qrcode = require('qrcode-terminal');

const app = express();
app.use(bodyParser.json());

let sock = null;
let isConnected = false;
let currentQR = null;

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
    
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, // We'll handle QR manually
        logger: P({ level: 'silent' })
    });
    
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            currentQR = qr;
            console.log('\n🔐 NEW QR CODE GENERATED!');
            console.log('📱 Scan this QR code using WhatsApp:');
            console.log('====================================');
            console.log('1. Open WhatsApp on your phone');
            console.log('2. Go to Settings → Linked Devices');
            console.log('3. Tap "Link a Device"');
            console.log('4. Scan the QR code from this URL:');
            console.log(`   https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`);
            console.log('====================================\n');
            
            // Also try to display terminal QR (might work in some views)
            try {
                qrcode.generate(qr, { small: true });
            } catch(e) {
                console.log('Terminal QR display failed, use the URL above');
            }
        }
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log('🔄 Reconnecting in 5 seconds...');
                setTimeout(() => connectToWhatsApp(), 5000);
            } else {
                console.log('🔴 Logged out. Please restart the service to reconnect.');
                isConnected = false;
            }
        } else if (connection === 'open') {
            isConnected = true;
            currentQR = null;
            console.log('\n✅ WhatsApp Bot Connected Successfully!');
            console.log('🎉 Your bot is ready to send OTP messages!\n');
        }
    });
    
    sock.ev.on('creds.update', saveCreds);
}

// API endpoint for your PHP signup page
app.post('/send-whatsapp', async (req, res) => {
    const { phone, message } = req.body;
    
    console.log(`📨 Received request to send OTP to: ${phone}`);
    
    if (!phone || !message) {
        return res.status(400).json({ 
            success: false, 
            message: 'Phone and message required' 
        });
    }
    
    if (!isConnected) {
        return res.status(503).json({ 
            success: false, 
            message: 'WhatsApp bot not connected. Please scan QR code first.' 
        });
    }
    
    try {
        // Format phone number for WhatsApp
        let formattedNumber = phone.toString().trim();
        formattedNumber = formattedNumber.replace(/[^0-9]/g, '');
        
        // Add country code if not present (Sri Lanka: 94)
        if (formattedNumber.startsWith('0')) {
            formattedNumber = '94' + formattedNumber.substring(1);
        }
        if (!formattedNumber.startsWith('94')) {
            formattedNumber = '94' + formattedNumber;
        }
        
        const whatsappId = formattedNumber + '@s.whatsapp.net';
        
        console.log(`📤 Sending OTP to: ${whatsappId}`);
        
        await sock.sendMessage(whatsappId, { text: message });
        
        console.log(`✅ OTP sent successfully to ${phone}`);
        res.json({ 
            success: true, 
            message: 'OTP sent successfully' 
        });
        
    } catch (error) {
        console.error('❌ Error sending message:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to send OTP: ' + error.message 
        });
    }
});

// Endpoint to get QR code (as JSON)
app.get('/qr', (req, res) => {
    if (currentQR) {
        res.json({ 
            qr: currentQR,
            url: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(currentQR)}`
        });
    } else if (isConnected) {
        res.json({ status: 'connected', message: 'Bot is already connected' });
    } else {
        res.json({ status: 'waiting', message: 'Waiting for QR code...' });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: isConnected ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString()
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        name: 'Mahawilacchiya E-Shop WhatsApp Bot',
        status: isConnected ? 'online' : 'offline',
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
    console.log(`📱 Endpoint: POST http://localhost:${PORT}/send-whatsapp`);
    console.log(`🔐 QR Code: GET http://localhost:${PORT}/qr`);
    console.log(`🏥 Health check: GET http://localhost:${PORT}/health\n`);
    console.log('Initializing WhatsApp connection...\n');
    connectToWhatsApp();
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n\n🛑 Shutting down...');
    if (sock) {
        await sock.logout();
    }
    process.exit(0);
});
