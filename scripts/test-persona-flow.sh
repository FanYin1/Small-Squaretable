#!/bin/bash

# Test Persona Flow
# 测试 Persona 在聊天中的完整流程

set -e

API_BASE="http://localhost:3000/api/v1"
TOKEN=""

echo "=== Persona 流程测试 ==="
echo ""

# 1. 登录获取 token
echo "1. 登录..."
LOGIN_RESPONSE=$(curl -s -X POST "$API_BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }')

TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.data.accessToken')

if [ "$TOKEN" == "null" ] || [ -z "$TOKEN" ]; then
  echo "❌ 登录失败"
  echo $LOGIN_RESPONSE | jq '.'
  exit 1
fi

echo "✅ 登录成功"
echo ""

# 2. 创建 Persona
echo "2. 创建 Persona..."
PERSONA_RESPONSE=$(curl -s -X POST "$API_BASE/personas" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "指挥官·艾伦",
    "description": "蔚蓝星域联邦第七舰队指挥官，军衔上校。冷静理性，擅长战术分析。",
    "metadata": {
      "age": "32",
      "gender": "男性",
      "rank": "上校",
      "affiliation": "蔚蓝星域联邦"
    },
    "isDefault": true
  }')

PERSONA_ID=$(echo $PERSONA_RESPONSE | jq -r '.data.id')

if [ "$PERSONA_ID" == "null" ] || [ -z "$PERSONA_ID" ]; then
  echo "❌ 创建 Persona 失败"
  echo $PERSONA_RESPONSE | jq '.'
  exit 1
fi

echo "✅ Persona 创建成功: $PERSONA_ID"
echo "   名称: $(echo $PERSONA_RESPONSE | jq -r '.data.name')"
echo ""

# 3. 获取角色列表
echo "3. 获取角色列表..."
CHARACTERS_RESPONSE=$(curl -s -X GET "$API_BASE/characters?limit=1" \
  -H "Authorization: Bearer $TOKEN")

CHARACTER_ID=$(echo $CHARACTERS_RESPONSE | jq -r '.data.items[0].id')

if [ "$CHARACTER_ID" == "null" ] || [ -z "$CHARACTER_ID" ]; then
  echo "❌ 没有可用的角色"
  exit 1
fi

CHARACTER_NAME=$(echo $CHARACTERS_RESPONSE | jq -r '.data.items[0].name')
echo "✅ 找到角色: $CHARACTER_NAME ($CHARACTER_ID)"
echo ""

# 4. 创建聊天（带 personaId）
echo "4. 创建聊天（使用 Persona）..."
CHAT_RESPONSE=$(curl -s -X POST "$API_BASE/chats" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"characterId\": \"$CHARACTER_ID\",
    \"personaId\": \"$PERSONA_ID\",
    \"title\": \"与 $CHARACTER_NAME 的对话\"
  }")

CHAT_ID=$(echo $CHAT_RESPONSE | jq -r '.data.id')

if [ "$CHAT_ID" == "null" ] || [ -z "$CHAT_ID" ]; then
  echo "❌ 创建聊天失败"
  echo $CHAT_RESPONSE | jq '.'
  exit 1
fi

echo "✅ 聊天创建成功: $CHAT_ID"
echo ""

# 5. 验证聊天中的 personaId
echo "5. 验证聊天数据..."
CHAT_DETAIL=$(curl -s -X GET "$API_BASE/chats/$CHAT_ID" \
  -H "Authorization: Bearer $TOKEN")

SAVED_PERSONA_ID=$(echo $CHAT_DETAIL | jq -r '.data.personaId')

if [ "$SAVED_PERSONA_ID" == "$PERSONA_ID" ]; then
  echo "✅ personaId 正确保存: $SAVED_PERSONA_ID"
else
  echo "❌ personaId 不匹配"
  echo "   期望: $PERSONA_ID"
  echo "   实际: $SAVED_PERSONA_ID"
  exit 1
fi

echo ""
echo "=== 测试完成 ==="
echo ""
echo "📝 测试结果:"
echo "   Persona ID: $PERSONA_ID"
echo "   Persona 名称: 指挥官·艾伦"
echo "   角色 ID: $CHARACTER_ID"
echo "   角色名称: $CHARACTER_NAME"
echo "   聊天 ID: $CHAT_ID"
echo ""
echo "✅ 所有测试通过！"
echo ""
echo "💡 提示: 在聊天中，{{user}} 宏会被替换为 '指挥官·艾伦'"
