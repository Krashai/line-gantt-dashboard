import mqtt from 'mqtt';
import { prisma } from '../lib/prisma';

const MQTT_URL = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
const client = mqtt.connect(MQTT_URL);

// Cache dla aktualnego stanu linii (żeby wiedzieć czy zliczać SCRAP)
const lineStateCache: Record<string, { status: boolean; lineId: string }> = {};

client.on('connect', () => {
  console.log('✅ Worker connected to MQTT Broker');
  client.subscribe('plc/gate/data/#', (err) => {
    if (err) console.error('❌ MQTT Subscription error:', err);
    else console.log('📡 Subscribed to plc/gate/data/#');
  });
});

client.on('message', async (topic, message) => {
  const parts = topic.split('/');
  // topic: plc/gate/data/{plc_id}/{tag_name}
  if (parts.length < 5) return;

  const plcId = parts[3];
  const tagName = parts[4];
  const value = message.toString();

  try {
    // 1. Pobierz lub zcache'uj ID linii z bazy
    if (!lineStateCache[plcId]) {
      const line = await prisma.line.findUnique({ where: { plcId } });
      if (!line) {
        console.warn(`⚠️ Received data for unknown PLC ID: ${plcId}`);
        return;
      }
      lineStateCache[plcId] = { status: false, lineId: line.id };
    }

    const { lineId } = lineStateCache[plcId];

    // 2. Obsługa tagów
    if (tagName === 'Status') {
      const status = value === '1' || value.toLowerCase() === 'true';
      lineStateCache[plcId].status = status;

      await prisma.machineStatusHistory.create({
        data: {
          lineId,
          status,
          speed: 0, // Prędkość zaktualizujemy innym tagiem lub zachowamy ostatnią
        }
      });
    } 
    else if (tagName === 'Speed') {
      const speed = parseFloat(value) || 0;
      await prisma.machineStatusHistory.create({
        data: {
          lineId,
          status: lineStateCache[plcId].status,
          speed
        }
      });
    }
    else if (tagName === 'Scrap_Pulse') {
      const isPulse = value === '1' || value.toLowerCase() === 'true';
      
      // Zliczaj tylko gdy puls jest aktywny I linia pracuje (Running)
      if (isPulse && lineStateCache[plcId].status) {
        await prisma.scrapEvent.create({
          data: { lineId }
        });
        console.log(`♻️ Scrap recorded for line ${lineId}`);
      }
    }

  } catch (error) {
    console.error(`❌ Worker error processing topic ${topic}:`, error);
  }
});

process.on('SIGTERM', () => {
  client.end();
  prisma.$disconnect();
});
