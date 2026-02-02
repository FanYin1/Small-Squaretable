#!/usr/bin/env tsx
/**
 * 测试脚本：导入角色卡片并测试聊天功能
 *
 * 使用方法：
 * tsx scripts/test-character-import.ts
 */

import fs from 'fs';
import path from 'path';
import { db } from '../src/db';
import { tenants, users, characters, chats, messages } from '../src/db/schema';
import { eq } from 'drizzle-orm';
import { LLMService } from '../src/server/services/llm.service';

// 配置
const CHARACTER_JSON_PATH = '/var/aichat/Rina.json';
const CHARACTER_IMAGE_PATH = '/var/aichat/无职.png';
const TEST_USER_EMAIL = 'test@example.com';
const TEST_MESSAGE = '嗨，Rina！我是新来的学生，很高兴认识你。';

async function main() {
  console.log('🚀 开始测试角色卡片导入和聊天功能...\n');

  try {
    // 1. 读取角色卡片 JSON
    console.log('📖 读取角色卡片文件...');
    const characterData = JSON.parse(fs.readFileSync(CHARACTER_JSON_PATH, 'utf-8'));
    const characterImage = fs.readFileSync(CHARACTER_IMAGE_PATH);
    console.log(`✅ 角色名称: ${characterData.data.name}`);
    console.log(`✅ 图片大小: ${(characterImage.length / 1024 / 1024).toFixed(2)} MB\n`);

    // 2. 查找或创建测试用户
    console.log('👤 查找测试用户...');
    let user = await db.query.users.findFirst({
      where: eq(users.email, TEST_USER_EMAIL),
    });

    if (!user) {
      console.log('创建测试用户...');
      // 创建租户
      const [tenant] = await db.insert(tenants).values({
        name: 'Test Tenant',
      }).returning();

      // 创建用户
      [user] = await db.insert(users).values({
        tenantId: tenant.id,
        email: TEST_USER_EMAIL,
        username: 'testuser',
        passwordHash: 'dummy-hash', // 测试用，不需要真实密码
      }).returning();

      console.log(`✅ 创建用户: ${user.email} (租户: ${tenant.id})`);
    } else {
      console.log(`✅ 找到用户: ${user.email} (租户: ${user.tenantId})\n`);
    }

    // 3. 导入角色卡片
    console.log('📥 导入角色卡片到数据库...');

    // 检查角色是否已存在
    let character = await db.query.characters.findFirst({
      where: eq(characters.name, characterData.data.name),
    });

    if (!character) {
      // 保存图片到本地存储
      const uploadsDir = path.join(process.cwd(), 'uploads', 'avatars');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      const avatarFilename = `${Date.now()}-${characterData.data.name}.png`;
      const avatarPath = path.join(uploadsDir, avatarFilename);
      fs.writeFileSync(avatarPath, characterImage);

      // 创建角色
      [character] = await db.insert(characters).values({
        tenantId: user.tenantId,
        userId: user.id,
        name: characterData.data.name,
        description: characterData.data.description,
        personality: characterData.data.personality || '',
        scenario: characterData.data.scenario || '',
        firstMessage: characterData.data.first_mes,
        exampleDialogue: characterData.data.mes_example || '',
        avatar: `/uploads/avatars/${avatarFilename}`,
        tags: characterData.data.tags || [],
        isPublic: false,
        isNsfw: characterData.data.tags?.includes('NSFW') || false,
        cardData: characterData, // 添加完整的卡片数据
      }).returning();

      console.log(`✅ 创建角色: ${character.name} (ID: ${character.id})\n`);
    } else {
      console.log(`✅ 角色已存在: ${character.name} (ID: ${character.id})\n`);
    }

    // 4. 创建聊天会话
    console.log('💬 创建聊天会话...');

    const [chat] = await db.insert(chats).values({
      tenantId: user.tenantId,
      userId: user.id,
      characterId: character.id,
      title: `与 ${character.name} 的对话`,
    }).returning();

    console.log(`✅ 创建聊天: ${chat.title} (ID: ${chat.id})\n`);

    // 5. 发送第一条消息（角色的开场白）
    console.log('📨 添加角色开场白...');
    const firstMessage = character.firstMessage || characterData.data.first_mes || '你好！';
    console.log(`开场白内容: ${firstMessage.substring(0, 50)}...`);

    await db.insert(messages).values({
      tenantId: user.tenantId,
      chatId: chat.id,
      role: 'assistant',
      content: firstMessage,
    });
    console.log(`✅ 角色开场白已添加\n`);

    // 6. 发送测试消息
    console.log('📨 发送测试消息...');
    const [userMessage] = await db.insert(messages).values({
      tenantId: user.tenantId,
      chatId: chat.id,
      role: 'user',
      content: TEST_MESSAGE,
    }).returning();
    console.log(`✅ 用户消息: "${TEST_MESSAGE}"\n`);

    // 7. 调用 LLM 生成回复
    console.log('🤖 调用 BigModel GLM-4 生成回复...');
    console.log('模型: glm-4-flash');
    console.log('API Base: https://open.bigmodel.cn/api/paas/v4\n');

    const llmService = new LLMService();

    // 构建对话历史
    const conversationHistory = [
      {
        role: 'system' as const,
        content: `你正在扮演 ${character.name}。

角色描述：
${character.description}

性格：
${character.personality}

场景：
${character.scenario}

请完全沉浸在这个角色中，用第一人称回复，保持角色的语气和行为特点。`,
      },
      {
        role: 'assistant' as const,
        content: character.firstMessage,
      },
      {
        role: 'user' as const,
        content: TEST_MESSAGE,
      },
    ];

    try {
      const response = await llmService.chatCompletion({
        model: 'glm-4-flash',
        messages: conversationHistory,
        temperature: 0.8,
        max_tokens: 500,
      });

      console.log('✅ LLM 回复成功！\n');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      const aiContent = response.choices[0].message.content;
      console.log(`${character.name}: ${aiContent}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      // 保存 AI 回复到数据库
      await db.insert(messages).values({
        tenantId: user.tenantId,
        chatId: chat.id,
        role: 'assistant',
        content: aiContent,
      });

      console.log('✅ AI 回复已保存到数据库\n');

      // 8. 显示完整对话历史
      console.log('📜 完整对话历史：');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      const { asc } = await import('drizzle-orm');
      const allMessages = await db.select()
        .from(messages)
        .where(eq(messages.chatId, chat.id))
        .orderBy(asc(messages.createdAt));

      for (const msg of allMessages) {
        const speaker = msg.role === 'user' ? '你' : character.name;
        console.log(`\n${speaker}: ${msg.content}`);
      }
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      // 9. 显示测试结果摘要
      console.log('✅ 测试完成！\n');
      console.log('📊 测试摘要：');
      console.log(`   - 角色: ${character.name}`);
      console.log(`   - 聊天 ID: ${chat.id}`);
      console.log(`   - 消息数: ${allMessages.length}`);
      console.log(`   - LLM 模型: glm-4-flash`);
      console.log(`   - API 提供商: BigModel (智谱AI)\n`);

      console.log('🌐 访问前端查看对话：');
      console.log(`   http://localhost:5173/chat/${chat.id}\n`);

    } catch (error: any) {
      console.error('❌ LLM 调用失败:', error.message);
      if (error.response) {
        console.error('响应数据:', error.response.data);
      }
      throw error;
    }

  } catch (error) {
    console.error('❌ 测试失败:', error);
    process.exit(1);
  }
}

main();
