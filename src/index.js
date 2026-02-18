const mqtt = require('mqtt');
const fs = require('fs');
require('dotenv').config();

// Configurazione tramite variabili d'ambiente (best practice per Dokploy)
const MQTT_HOST = process.env.MQTT_HOST || 'mqtt-broker'; // Nome del servizio in docker-compose
const MQTT_PORT = process.env.MQTT_PORT || 8883;
const MQTT_USER = process.env.MQTT_USER;
const MQTT_PASS = process.env.MQTT_PASS;

// Caricamento del certificato CA (da Env Variable o File)
let caContent;
if (process.env.MQTT_CA_CERT) {
    caContent = process.env.MQTT_CA_CERT;
} else if (fs.existsSync('/files/ca.crt')) {
    // Percorso predefinito per i File Mount di Dokploy
    caContent = fs.readFileSync('/files/ca.crt');
} else if (fs.existsSync('./certs/ca.crt')) {
    // Fallback locale
    caContent = fs.readFileSync('./certs/ca.crt');
} else {
    console.warn('[MQTT] ⚠️ Attenzione: Nessun certificato CA trovato. (Controllati: MQTT_CA_CERT, /files/ca.crt, ./certs/ca.crt)');
}

// Opzioni di connessione TLS
const options = {
    host: MQTT_HOST,
    port: MQTT_PORT,
    protocol: 'mqtts',
    username: MQTT_USER,
    password: MQTT_PASS,
    rejectUnauthorized: true, // Verifica il certificato del broker
    ca: caContent ? [caContent] : undefined,
    reconnectPeriod: 5000,
    connectTimeout: 30 * 1000,
};

const client = mqtt.connect(options);

// --- GESTIONE EVENTI ---

client.on('connect', () => {
    console.log(`[MQTT] ✅ Connesso al broker su ${MQTT_HOST}:${MQTT_PORT}`);
    
    // Iscrizione ai topic dei terminali usando il wildcard '+'
    // devices/terminale_1/data, devices/terminale_2/data, ecc.
    client.subscribe('devices/+/data', (err) => {
        if (!err) {
            console.log('[MQTT] 📡 In ascolto su tutti i terminali (devices/+/data)');
        }
    });
});

client.on('message', (topic, message) => {
    try {
        const payload = JSON.parse(message.toString());
        const terminalId = topic.split('/')[1]; // Estrae l'ID dal topic
        
        console.log(`[DATA] Ricevuto da ${terminalId}:`, payload);
        
        // Qui chiamerai la tua funzione per salvare su DB o processare i dati
        handleTerminalData(terminalId, payload);
        
    } catch (e) {
        console.error(`[ERROR] Messaggio non valido su ${topic}:`, message.toString());
    }
});

client.on('error', (err) => {
    console.error('[MQTT] ❌ Errore di connessione:', err.message);
});

client.on('offline', () => {
    console.warn('[MQTT] ⚠️ Il broker è offline. Tentativo di riconnessione...');
});

// --- LOGICA DI BUSINESS ---

function handleTerminalData(id, data) {
    // Esempio: logica di filtraggio o salvataggio
    // if (data.temperature > 40) console.log(`ALERT: Surriscaldamento su ${id}!`);
}