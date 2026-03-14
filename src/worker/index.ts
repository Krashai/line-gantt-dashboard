import mqtt from 'mqtt';
import { prisma } from '../lib/prisma';

const MQTT_URL = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
const client = mqtt.connect(MQTT_URL);

// Cache dla aktualnego stanu linii
const lineStateCache: Record<string, { status: boolean; speed: number; lineId: string }> = {};

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
      lineStateCache[plcId] = { status: false, speed: 0, lineId: line.id };
    }

    // 2. Obsługa tagów
    if (tagName === 'Status') {
      const status = value === '1' || value.toLowerCase() === 'true';
      lineStateCache[plcId].status = status;

      await prisma.machineStatusHistory.create({
        data: {
          lineId: lineStateCache[plcId].lineId,
          status: status,
          speed: lineStateCache[plcId].speed, // Używamy ostatniej znanej prędkości
        }
      });
    } 
    else if (tagName === 'Speed') {
      const speed = parseFloat(value) || 0;
      lineStateCache[plcId].speed = speed;

      await prisma.machineStatusHistory.create({
        data: {
          lineId: lineStateCache[plcId].lineId,
          status: lineStateCache[plcId].status, // Używamy ostatniego znanego statusu
          speed: speed
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
