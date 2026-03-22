# Mahawilacchiya E-Shop WhatsApp Bot

WhatsApp bot for OTP verification and commission payment management.

## Features

- OTP sending for buyer/seller verification
- Payment slip forwarding to admin
- Admin commands: `.pending`, `.verify`, `.status`
- 24/7 operation on Fly.io

## Deployment

1. Clone this repository
2. Run `flyctl launch`
3. Deploy with `flyctl deploy`
4. Get QR code from logs
5. Scan with WhatsApp

## Commands

- `.help` - Show all commands
- `.pending` - List pending payments
- `.verify [ID]` - Verify a payment
- `.status` - Check bot status
