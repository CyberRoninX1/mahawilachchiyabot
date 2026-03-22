const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const bodyParser = require('body-parser');
const qrcode = require('qrcode-terminal');

const app = express();
app.use(bodyParser.json());

let sock = null;
let isConnected = false;
let currentQR = null;

// Admin WhatsApp number
const ADMIN_NUMBER = '94789748241'; // CHANGE THIS TO YOUR NUMBER

async function connectToWhatsApp() {
    console.log('📱 Starting WhatsApp connection...');
    
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
    
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        browser: ['Mahawilacchiya E-Shop', 'Chrome', '1.0.0']
    });
    
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            currentQR = qr;
            console.log('\n🔐 QR CODE GENERATED!\n');
            qrcode.generate(qr, { small: true });
            console.log('\n📱 Open WhatsApp > Settings > Linked Devices > Link a Device\n');
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
            console.log('\n✅ WHATSAPP CONNECTED!\n');
            console.log('📱 Admin WhatsApp: ' + ADMIN_NUMBER);
            console.log('💡 Commands:');
            console.log('   .help - Show commands');
            console.log('   .pending - Show pending payments');
            console.log('   .verify [ID] - Verify a payment');
            console.log('   .status - Check bot status\n');
        }
    });
    
    // ============ HANDLE INCOMING MESSAGES ============
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
        const senderNumber = sender.split('@')[0];
        
        console.log(`📩 Received: "${messageText}" from ${senderName} (${senderNumber})`);
        
        // Only process commands from admin
        const isAdmin = senderNumber === ADMIN_NUMBER || sender === ADMIN_NUMBER + '@s.whatsapp.net';
        
        if (!isAdmin && messageText.startsWith('.')) {
            await sock.sendMessage(sender, { text: '❌ You are not authorized to use admin commands.' });
            return;
        }
        
        // ============ ADMIN COMMANDS ============
        
        // .help
        if (messageText === '.help') {
            const helpMessage = `🤖 *Admin Bot Commands*\n\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `🔹 *.pending* - Show pending payments\n` +
                `🔹 *.verify [ID]* - Verify a payment\n` +
                `🔹 *.status* - Check bot status\n` +
                `🔹 *.help* - Show this menu\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                `📌 *Example:*\n` +
                `.verify 8\n\n` +
                `🏪 *Mahawilacchiya E-Shop*`;
            
            await sock.sendMessage(sender, { text: helpMessage });
            console.log(`✅ Sent help to admin`);
        }
        
        // .pending
        else if (messageText === '.pending') {
            try {
                const response = await fetch('https://mahawilachchiyaeshop.gt.tc/api/pending-payments.php');
                const data = await response.json();
                
                if (data.success && data.payments && data.payments.length > 0) {
                    let pendingMessage = `📋 *Pending Payments*\n\n`;
                    pendingMessage += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
                    for (let payment of data.payments) {
                        pendingMessage += `🆔 ID: ${payment.id}\n`;
                        pendingMessage += `🏪 Shop: ${payment.shop_name}\n`;
                        pendingMessage += `💰 Amount: Rs. ${payment.amount}\n`;
                        pendingMessage += `📅 Date: ${payment.date}\n`;
                        pendingMessage += `🔖 Ref: ${payment.transaction_ref}\n`;
                        pendingMessage += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
                    }
                    pendingMessage += `\n✅ To verify: .verify [ID]\n`;
                    pendingMessage += `Example: .verify ${data.payments[0].id}`;
                    
                    await sock.sendMessage(sender, { text: pendingMessage });
                } else {
                    await sock.sendMessage(sender, { text: '✅ No pending payments.' });
                }
            } catch (error) {
                console.error('Error:', error);
                await sock.sendMessage(sender, { text: '❌ Error fetching pending payments. Check server connection.' });
            }
        }
        
        // .verify [ID]
        else if (messageText.startsWith('.verify')) {
            const parts = messageText.split(' ');
            const paymentId = parts[1];
            
            if (!paymentId) {
                await sock.sendMessage(sender, { text: '❌ Please provide payment ID. Example: .verify 8' });
                return;
            }
            
            try {
                const response = await fetch('https://mahawilachchiyaeshop.gt.tc/api/verify-payment.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ payment_id: paymentId })
                });
                const result = await response.json();
                
                if (result.success) {
                    const successMessage = `✅ *Payment Verified!*\n\n` +
                        `Payment ID: ${paymentId}\n` +
                        `Shop: ${result.shop_name}\n` +
                        `Amount: Rs. ${result.amount}\n\n` +
                        `The seller's account has been updated.`;
                    
                    await sock.sendMessage(sender, { text: successMessage });
                    console.log(`✅ Verified payment ${paymentId}`);
                } else {
                    await sock.sendMessage(sender, { text: `❌ ${result.message}` });
                }
            } catch (error) {
                console.error('Error:', error);
                await sock.sendMessage(sender, { text: '❌ Error verifying payment. Check server connection.' });
            }
        }
        
        // .status
        else if (messageText === '.status') {
            const statusMessage = `📊 *Bot Status*\n\n` +
                `✅ Connection: ${isConnected ? 'Connected' : 'Disconnected'}\n` +
                `👤 Admin: ${ADMIN_NUMBER}\n` +
                `🕐 Time: ${new Date().toLocaleString()}\n` +
                `📱 WhatsApp Bot Running`;
            
            await sock.sendMessage(sender, { text: statusMessage });
        }
        
        // Unknown command
        else if (messageText.startsWith('.')) {
            await sock.sendMessage(sender, { text: '❌ Unknown command. Send .help for available commands.' });
        }
    });
    
    sock.ev.on('creds.update', saveCreds);
}

// ============ API ENDPOINTS ============

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

app.get('/health', (req, res) => {
    res.json({ status: isConnected ? 'connected' : 'disconnected' });
});

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Bot running on http://0.0.0.0:${PORT}`);
    console.log(`📨 POST http://0.0.0.0:${PORT}/send-whatsapp`);
    console.log(`🔐 QR: http://0.0.0.0:${PORT}/qr`);
    console.log(`👤 Admin: ${ADMIN_NUMBER}\n`);
    connectToWhatsApp();
});
