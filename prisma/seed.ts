import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DATA = [
  {
    name: 'HALA 1',
    lines: [
      { plcId: 'LP202', name: 'LP202 (S7-300)' },
      { plcId: 'LP405', name: 'LP405' },
      { plcId: 'LP702', name: 'LP702' },
      { plcId: 'LP802', name: 'LP802' },
      { plcId: 'LP902', name: 'LP902' },
    ]
  },
  {
    name: 'HALA 2',
    lines: [
      { plcId: 'LP302', name: 'LP302' },
      { plcId: 'LP402', name: 'LP402' },
      { plcId: 'LP502', name: 'LP502' },
      { plcId: 'LP602', name: 'LP602' },
    ]
  },
  {
    name: 'HALA 3',
    lines: [
      { plcId: 'LCE131', name: 'LCE131' },
      { plcId: 'LP205', name: 'LP205' },
      { plcId: 'LP305', name: 'LP305' },
      { plcId: 'LP505', name: 'LP505' },
      { plcId: 'LP605', name: 'LP605' },
      { plcId: 'LP705', name: 'LP705' },
      { plcId: 'LP707', name: 'LP707' },
      { plcId: 'LP805', name: 'LP805' },
    ]
  },
  {
    name: 'HALA 4',
    lines: [
      { plcId: 'INS1', name: 'INS1' },
      { plcId: 'INS2', name: 'INS2' },
      { plcId: 'LCE132', name: 'LCE132' },
      { plcId: 'LP606', name: 'LP606' },
      { plcId: 'LP607', name: 'LP607' },
      { plcId: 'LP608', name: 'LP608' },
      { plcId: 'LP609', name: 'LP609' },
    ]
  }
];

const PRODUCTS = ['XJ-100', 'XJ-200', 'Y-ALPHA', 'Z-BETA', 'K-GAMMA', 'M-DELTA', 'OMEGA-7'];

async function main() {
  console.log('🧹 Cleaning up database...');
  await prisma.productionPlan.deleteMany();
  await prisma.machineStatusHistory.deleteMany();
  await prisma.scrapEvent.deleteMany();
  await prisma.downtimeComment.deleteMany();
  await prisma.line.deleteMany();
  await prisma.hall.deleteMany();

  console.log('🌱 Seeding production halls and lines...');

  for (const hallData of DATA) {
    const hall = await prisma.hall.upsert({
      where: { name: hallData.name },
      update: {},
      create: { name: hallData.name },
    });

    for (const lineData of hallData.lines) {
      const line = await prisma.line.upsert({
        where: { plcId: lineData.plcId },
        update: { name: lineData.name, hallId: hall.id },
        create: { ...lineData, hallId: hall.id },
      });

      // Clear existing records for this line
      await prisma.productionPlan.deleteMany({ where: { lineId: line.id } });
      await prisma.machineStatusHistory.deleteMany({ where: { lineId: line.id } });
      await prisma.scrapEvent.deleteMany({ where: { lineId: line.id } });

      // Generate random production plans (for timeline)
      let planStartTime = new Date();
      planStartTime.setDate(planStartTime.getDate() - 2);
      planStartTime.setHours(6, 0, 0, 0);

      for (let i = 0; i < 8; i++) {
        const durationHours = Math.floor(Math.random() * 12) + 6;
        const startTime = new Date(planStartTime);
        const endTime = new Date(planStartTime);
        endTime.setHours(endTime.getHours() + durationHours);

        await prisma.productionPlan.create({
          data: {
            lineId: line.id,
            productIndex: PRODUCTS[Math.floor(Math.random() * PRODUCTS.length)],
            startTime: startTime,
            endTime: endTime,
            plannedSpeed: Math.floor(Math.random() * 20) + 30,
          }
        });

        planStartTime = new Date(endTime);
        planStartTime.setHours(planStartTime.getHours() + Math.floor(Math.random() * 2) + 1);
      }

      // Generate machine status history (for active state)
      const now = new Date();
      const historyStart = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago
      
      console.log(`   Generating history for ${line.name}...`);
      
      const historyData = [];
      const scrapData = [];
      
      let currentHistoryTime = new Date(historyStart);
      while (currentHistoryTime <= now) {
        // 80% chance of being RUNNING
        const isRunning = Math.random() > 0.2;
        const speed = isRunning ? (Math.random() * 15 + 35) : 0; // 35-50 m/min if running
        
        historyData.push({
          lineId: line.id,
          time: new Date(currentHistoryTime),
          status: isRunning,
          speed: speed,
        });

        // Occasional scrap event if running
        if (isRunning && Math.random() > 0.95) {
          scrapData.push({
            lineId: line.id,
            time: new Date(currentHistoryTime),
          });
        }

        currentHistoryTime.setMinutes(currentHistoryTime.getMinutes() + 5); // every 5 mins
      }

      await prisma.machineStatusHistory.createMany({ data: historyData });
      await prisma.scrapEvent.createMany({ data: scrapData });
    }
  }

  console.log('✅ Seed finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
