const { PrismaClient } = require('../packages/core/node_modules/@prisma/client');

/**
 * 1000 章节压力测试脚本 (CommonJS)
 * 运行方式: node scripts/load-test.js
 */

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: 'file:C:/Users/SchrodingerXiong/AppData/Roaming/@novel-editor/desktop/novel_editor.db',
        },
    },
});

async function main() {
    console.log('🚀 开始 1000 章节压力测试数据生成...');

    // 1. 查找第一个小说，若无则创建一个
    let novel = await prisma.novel.findFirst();

    if (!novel) {
        console.log('📝 未找到小说，正在创建压力测试小说...');
        novel = await prisma.novel.create({
            data: {
                title: '压力测试专用小说',
                description: '用于测试 1000 章节下的矩阵渲染性能',
                wordCount: 0
            }
        });
    }

    console.log(`📖 目标小说: ${novel.title} (ID: ${novel.id})`);

    // 2. 查找或创建第一个卷 (Volume)
    let volume = await prisma.volume.findFirst({
        where: { novelId: novel.id },
        orderBy: { order: 'asc' }
    });

    if (!volume) {
        console.log('📦 未找到卷，正在创建测试卷...');
        volume = await prisma.volume.create({
            data: {
                title: '压力测试卷',
                order: 1,
                novelId: novel.id
            }
        });
    }

    console.log(`📁 目标卷: ${volume.title} (ID: ${volume.id})`);

    // 3. 获取当前章节最大排序
    const lastChapter = await prisma.chapter.findFirst({
        where: { volumeId: volume.id },
        orderBy: { order: 'desc' }
    });
    let startOrder = (lastChapter?.order || 0) + 1;

    console.log(`⏱️ 准备插入 1000 个章节，起始序号: ${startOrder}...`);

    const chaptersToCreate = [];
    const contentFiller = '这是一段重复的情节内容。为了测试 1000 章节下的矩阵渲染性能，我们需要大量的占位数据。此段文字将被重复多次。'.repeat(10);

    for (let i = 0; i < 1000; i++) {
        chaptersToCreate.push({
            title: `测试章节 ${startOrder + i}`,
            content: contentFiller,
            wordCount: contentFiller.length,
            order: startOrder + i,
            volumeId: volume.id
        });
    }

    // 4. 执行批量插入
    console.log('🧱 正在写入数据库...');

    const batchSize = 50; // 并行度控制
    for (let i = 0; i < chaptersToCreate.length; i += batchSize) {
        const batch = chaptersToCreate.slice(i, i + batchSize);
        await Promise.all(
            batch.map(data => prisma.chapter.create({ data }))
        );
        console.log(`✅ 已完成: ${Math.min(i + batchSize, 1000)}/1000`);
    }

    console.log('🎉 压力测试数据已成功生成！请返回 UI 观察矩阵渲染表现。');
}

main()
    .catch((e) => {
        console.error('❌ 脚本执行失败:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
