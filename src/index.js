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
    
    // Sottoscrizione ampliata per catturare TUTTO il traffico accesscontrol
    const subscribeTopic = 'accesscontrol/#';
    
    client.subscribe(subscribeTopic, (err) => {
        if (!err) {
            console.log(`[MQTT] 📡 In ascolto su tutto il ramo: ${subscribeTopic}`);
        }
    });
});

client.on('message', (topic, message) => {
    const messageStr = message.toString();
    // LOG RAW - Identifica ogni messaggio che attraversa il broker
    console.log(`[RAW-DEBUG] Topic: ${topic}`);
    
    try {
        const payload = JSON.parse(messageStr);
        const parts = topic.split('/');
        
        // Cerca 'lettura' o altri sotto-topic indipendentemente dalla profondità
        const isLettura = parts.includes('lettura');
        
        // Identifica il Terminal ID (solitamente dopo 'aggregatore', 'demo' o 'teamsystem')
        // In base ai log, è solitamente al terzo o quarto posto
        let terminalId = parts[3];
        let subTopic = parts[parts.length - 1]; // L'ultimo segmento è solitamente l'azione/dato
        
        if (isLettura) {
            console.log(`[LECTURE] 🪪 Timbratura rilevata sul topic ${topic}:`, payload);
        } else {
            console.log(`[DATA] Ricevuto da ${terminalId} (${subTopic}):`, payload);
        }
        
        handleTerminalData(terminalId, payload, subTopic);
        
    } catch (e) {
        // Se non è un JSON, lo logghiamo come informazione semplice (es. stringhe di stato)
        console.log(`[INFO] Messaggio testuale su ${topic}: ${messageStr}`);
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