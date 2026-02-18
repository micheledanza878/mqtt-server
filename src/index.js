const mqtt = require('mqtt');
const fs = require('fs');
require('dotenv').config();

// Configurazione tramite variabili d'ambiente (best practice per Dokploy)
const MQTT_HOST = process.env.MQTT_HOST || 'mqtt-server'; 
const MQTT_PORT = process.env.MQTT_PORT || 8883;
const MQTT_USER = process.env.MQTT_USER;
const MQTT_PASS = process.env.MQTT_PASS;

// Caricamento del certificato CA (da Env Variable o File)
let caContent;
if (process.env.MQTT_CA_CERT) {
    // Gestisce eventuali escape dei newline se incollati male in Dokploy
    caContent = process.env.MQTT_CA_CERT.replace(/\\n/g, '\n');
    console.log('[MQTT] 📝 Certificato CA caricato da variabile d\'ambiente.');
} else if (fs.existsSync('/files/ca.crt')) {
    caContent = fs.readFileSync('/files/ca.crt');
    console.log('[MQTT] 📝 Certificato CA caricato da /files/ca.crt');
} else if (fs.existsSync('./certs/ca.crt')) {
    caContent = fs.readFileSync('./certs/ca.crt');
    console.log('[MQTT] 📝 Certificato CA caricato da ./certs/ca.crt');
} else {
    console.warn('[MQTT] ⚠️ Attenzione: Nessun certificato CA trovato.');
}

console.log('[DEBUG] --- Configurazione MQTT ---');
console.log(`[DEBUG] Host: ${MQTT_HOST}`);
console.log(`[DEBUG] Port: ${MQTT_PORT}`);
console.log(`[DEBUG] MQTT_REJECT_UNAUTHORIZED (Env): ${process.env.MQTT_REJECT_UNAUTHORIZED}`);
console.log(`[DEBUG] CA Content presente: ${!!caContent}`);

// Opzioni di connessione TLS
const options = {
    host: MQTT_HOST,
    port: MQTT_PORT,
    protocol: 'mqtts',
    username: MQTT_USER,
    password: MQTT_PASS,
    // Logica di sicurezza corretta:
    // Se MQTT_REJECT_UNAUTHORIZED è 'false', accettiamo tutto.
    // Altrimenti, se abbiamo una CA, verifichiamo il certificato.
    // Se non abbiamo nulla, rejectUnauthorized sarà false per default (su Dokploy).
    rejectUnauthorized: process.env.MQTT_REJECT_UNAUTHORIZED === 'false' ? false : 
                       (process.env.MQTT_REJECT_UNAUTHORIZED === 'true' ? true : !!caContent),
    ca: caContent ? [caContent] : undefined,
    reconnectPeriod: 5000,
    connectTimeout: 30 * 1000,
};

console.log(`[DEBUG] Verifica certificato attiva (rejectUnauthorized): ${options.rejectUnauthorized}`);
console.log('[DEBUG] ----------------------------');

const client = mqtt.connect(options);

// --- GESTIONE EVENTI ---

client.on('connect', () => {
    console.log(`[MQTT] ✅ Connesso al broker su ${MQTT_HOST}:${MQTT_PORT}`);
    
    // Sottoscrizione ai topic rimappati dal Bridge
    // Il bridge mappa accesscontrol/apromixrfid/demo/ -> accesscontrol/apromixrfid/aggregatore/
    const subscribeTopic = 'accesscontrol/apromixrfid/aggregatore/#';
    
    client.subscribe(subscribeTopic, (err) => {
        if (!err) {
            console.log(`[MQTT] 📡 In ascolto sui topic del Bridge: ${subscribeTopic}`);
        }
    });
});

client.on('message', (topic, message) => {
    console.log(`[DEBUG] Messaggio ricevuto su topic: ${topic}`);
    try {
        const payload = JSON.parse(message.toString());
        // Estrazione ID terminale dalla struttura: accesscontrol/apromixrfid/aggregatore/Q2-F8DC7A47789C/
        const parts = topic.split('/');
        const terminalId = parts[4] || 'unknown'; 
        
        console.log(`[DATA] Ricevuto da ${terminalId}:`, payload);
        handleTerminalData(terminalId, payload);
        
    } catch (e) {
        console.error(`[ERROR] Messaggio non valido su ${topic}:`, message.toString());
    }
});

client.on('error', (err) => {
    console.error('[MQTT] ❌ Errore di connessione:', err.message);
});

client.on('offline', () => {
    process.stdout.write('.'); // Log compatto per offline
});

// --- LOGICA DI BUSINESS ---

function handleTerminalData(id, data) {
    // Implementazione logica di business
}