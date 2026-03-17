import mqtt from 'mqtt';
import { prisma } from '../lib/prisma';

const MQTT_URL = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
const client = mqtt.connect(MQTT_URL);

// Cache dla aktualnego stanu linii
const lineStateCache: Record<string, { status: boolean; speed: number; lineId: string }> = {};

client.on('connect', () => {
  console.log('✅ Worker connected to MQTT Broker');
  client.subscribe('lines/#', (err) => {
    if (err) console.error('❌ MQTT Subscription error:', err);
    else console.log('📡 Subscribed to lines/#');
  });
});

client.on('message', async (topic, message) => {
  const parts = topic.split('/');
  // topic: lines/{plc_id}/{tag_name}
  if (parts.length < 3) return;

  const plcId = parts[1];
  const tagName = parts[2];
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

    const { lineId } = lineStateCache[plcId];
    const lowerTagName = tagName.toLowerCase();

    // 2. Obsługa tagów (Case-insensitive + aliasy)
    if (lowerTagName === 'status' || lowerTagName === 'state' || lowerTagName === 'state2') {
      const status = value === '1' || value.toLowerCase() === 'true';
      lineStateCache[plcId].status = status;

      await prisma.machineStatusHistory.create({
        data: {
          lineId,
          status,
          speed: lineStateCache[plcId].speed, 
        }
      });
      console.log(`📊 Status updated for ${plcId}: ${status}`);
    } 
    else if (lowerTagName === 'speed') {
      const speed = parseFloat(value) || 0;
      
      lineStateCache[plcId].speed = speed;

      await prisma.machineStatusHistory.create({
        data: {
          lineId,
          status: lineStateCache[plcId].status, // Używamy tylko jawnie ustawionego statusu
          speed
        }
      });
      console.log(`🚀 Speed updated for ${plcId}: ${speed} (Current Status: ${lineStateCache[plcId].status})`);
    }
    else if (lowerTagName === 'scrap_pulse' || lowerTagName === 'scrap') {
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
