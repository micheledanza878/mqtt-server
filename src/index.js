const mqtt = require('mqtt');
const fs = require('fs');
const axios = require('axios');
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
    // --- PERSISTENZA ---
    clientId: process.env.MQTT_CLIENT_ID || 'apromix-backend-cloud',
    clean: false, // Sessione persistente: il broker tiene i messaggi se l'app è offline
    
    // --- SSL/TLS ---
    rejectUnauthorized: process.env.MQTT_REJECT_UNAUTHORIZED === 'false' ? false : 
                       (process.env.MQTT_REJECT_UNAUTHORIZED === 'true' ? true : false), // Default a false se non specificato per evitare blocchi CA
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
    
    // Sottoscrizione con QoS 1 per garantire la ricezione dei messaggi persistenti
    const subscribeTopic = 'accesscontrol/#';
    
    client.subscribe(subscribeTopic, { qos: 1 }, (err) => {
        if (!err) {
            console.log(`[MQTT] 📡 In ascolto su tutto il ramo con QoS 1: ${subscribeTopic}`);
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
        
        // Identifica il Terminal ID cercando dinamicamente il segmento dopo 'aggregatore'
        const aggIndex = parts.indexOf('aggregatore');
        let terminalId = aggIndex !== -1 && parts[aggIndex + 1] ? parts[aggIndex + 1] : 'unknown';
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

/**
 * Gestisce i dati ricevuti dai terminali e li inoltra via HTTP
 */
async function handleTerminalData(terminalId, payload, subTopic) {
    // Inoltriamo solo le 'letture' (timbrature effettive)
    if (subTopic === 'lettura') {
        const apiUrl = process.env.BACKEND_API_URL;
        
        if (!apiUrl) {
            console.warn('[HTTP] ⚠️ BACKEND_API_URL non configurata. Salto inoltro.');
            return;
        }

        try {
            const postData = {
                terminalID: terminalId,
                payload: payload,
                sentAt: new Date().toISOString()
            };

            console.log(`[HTTP] 📤 Inizializzazione invio a: ${apiUrl}`);
            console.log(`[HTTP] 📦 Payload: ${JSON.stringify(postData)}`);
            
            const response = await axios.post(apiUrl, postData, { timeout: 5000 });

            console.log(`[HTTP] ✅ Risposta ricevuta dal server (${response.status})`);
            console.log(`[HTTP] 📝 Dati risposta: ${JSON.stringify(response.data)}`);
        } catch (err) {
            console.error(`[HTTP] ❌ Errore durante l'invio alla API per ${terminalId}:`);
            if (err.response) {
                // Il server ha risposto con uno status fuori dal range 2xx
                console.error(`[HTTP-ERR] Status: ${err.response.status}`);
                console.error(`[HTTP-ERR] Data: ${JSON.stringify(err.response.data)}`);
            } else if (err.request) {
                // La richiesta è stata fatta ma non è arrivata risposta
                console.error(`[HTTP-ERR] Nessuna risposta ricevuta. Controlla l'IP/URL: ${apiUrl}`);
            } else {
                // Errore nella configurazione della richiesta
                console.error(`[HTTP-ERR] Messaggio: ${err.message}`);
            }
        }
    }
}