const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    downloadContentFromMessage, 
    disconnectReason 
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const axios = require("axios");
const fs = require("fs-extra");

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('session');
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: 'silent' })
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (chat) => {
        const m = chat.messages[0];
        if (!m.message) return;
        const from = m.key.remoteJid;
        const type = Object.keys(m.message)[0];
        const body = (type === 'conversation') ? m.message.conversation : 
                     (type === 'extendedTextMessage') ? m.message.extendedTextMessage.text : '';

        const prefix = '.';
        const isCmd = body.startsWith(prefix);
        const command = isCmd ? body.slice(prefix.length).trim().split(' ')[0].toLowerCase() : '';
        const args = body.trim().split(/ +/).slice(1);
        const text = args.join(" ");

        if (isCmd) {
            switch (command) {
                
                // 1. AI Command Fix
                case 'ai':
                    if (!text) return sock.sendMessage(from, { text: "Sawal toh likho! Example: .ai hello" });
                    try {
                        // Updated AI API call
                        const res = await axios.get(`https://api.simsimi.vn/v1/simtalk?text=${encodeURIComponent(text)}&lc=ur`);
                        const aiReply = res.data.message || "AI response nahi de raha, baad mein try karein.";
                        await sock.sendMessage(from, { text: `🤖 *AI:* ${aiReply}` }, { quoted: m });
                    } catch (e) {
                        await sock.sendMessage(from, { text: "⚠️ AI error! API down ho sakti hai." });
                    }
                    break;

                // 2. Status Download Command
                case 'save':
                    if (!text) return sock.sendMessage(from, { text: "Number likho! Example: .save 923xxxxxxxxx" });
                    try {
                        const statusJid = 'status@broadcast';
                        const catalog = await sock.getMessagesFromJid(statusJid);
                        const targetStatus = catalog.filter(msg => msg.key.participant && msg.key.participant.includes(text));

                        if (targetStatus.length > 0) {
                            for (let stat of targetStatus) {
                                await sock.copyNForward(from, stat, true);
                            }
                            await sock.sendMessage(from, { text: "✅ Status bhej diya gaya hai." });
                        } else {
                            await sock.sendMessage(from, { text: "❌ Is number ka koi active status nahi mila." });
                        }
                    } catch (e) {
                        await sock.sendMessage(from, { text: "⚠️ Status fetch karne mein error aaya." });
                    }
                    break;

                // 3. View Once Download (Reply command)
                case 'one':
                    const quoted = m.message.extendedTextMessage?.contextInfo?.quotedMessage;
                    const viewOnce = quoted?.viewOnceMessageV2 || quoted?.viewOnceMessage;
                    
                    if (!viewOnce) return sock.sendMessage(from, { text: "Kisi *View Once* photo/video pe reply karke .one likho!" });

                    try {
                        const mediaType = Object.keys(viewOnce.message)[0]; // imageMessage ya videoMessage
                        const stream = await downloadContentFromMessage(viewOnce.message[mediaType], mediaType.replace('Message', ''));
                        let buffer = Buffer.from([]);
                        for await (const chunk of stream) {
                            buffer = Buffer.concat([buffer, chunk]);
                        }

                        if (mediaType === 'imageMessage') {
                            await sock.sendMessage(from, { image: buffer, caption: "View Once Downloaded ✅" }, { quoted: m });
                        } else {
                            await sock.sendMessage(from, { video: buffer, caption: "View Once Downloaded ✅" }, { quoted: m });
                        }
                    } catch (e) {
                        await sock.sendMessage(from, { text: "⚠️ Media decode nahi ho saka." });
                    }
                    break;
            }
        }
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            if (lastDisconnect.error?.output?.statusCode !== disconnectReason.loggedOut) {
                startBot();
            }
        } else if (connection === 'open') {
            console.log('Bot Connected Successfully! ✅');
        }
    });
}
