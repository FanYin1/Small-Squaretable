#!/bin/bash

# Simple Persona Test (without jq dependency)
set -e

API_BASE="http://localhost:3000/api/v1"

echo "=== Persona 保存测试 ==="
echo ""

# 1. 登录
echo "1. 登录测试账户..."
LOGIN_RESPONSE=$(curl -s -X POST "$API_BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123456"
  }')

# 提取 token (简单字符串处理)
TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ 登录失败，尝试注册新账户..."

  # 注册新账户
  REGISTER_RESPONSE=$(curl -s -X POST "$API_BASE/auth/register" \
    -H "Content-Type: application/json" \
    -d '{
      "email": "test@example.com",
      "password": "Test123456",
      "name": "测试用户"
    }')

  TOKEN=$(echo "$REGISTER_RESPONSE" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

  if [ -z "$TOKEN" ]; then
    echo "❌ 注册也失败了"
    echo "响应: $REGISTER_RESPONSE"
    exit 1
  fi

  echo "✅ 注册成功"
fi

echo "✅ 已获取 token: ${TOKEN:0:20}..."
echo ""

# 2. 创建 Persona
echo "2. 创建测试 Persona..."
PERSONA_RESPONSE=$(curl -s -X POST "$API_BASE/personas" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "凡音",
    "description": "测试用户角色",
    "metadata": {
      "test": "true"
    },
    "isDefault": true
  }')

PERSONA_ID=$(echo "$PERSONA_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$PERSONA_ID" ]; then
  echo "❌ 创建 Persona 失败"
  echo "响应: $PERSONA_RESPONSE"
  exit 1
fi

echo "✅ Persona 创建成功"
echo "   ID: $PERSONA_ID"
echo "   名称: 凡音"
echo ""

# 3. 获取或创建角色
echo "3. 获取测试角色..."
CHARACTERS_RESPONSE=$(curl -s -X GET "$API_BASE/characters?limit=1" \
  -H "Authorization: Bearer $TOKEN")

CHARACTER_ID=$(echo "$CHARACTERS_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$CHARACTER_ID" ]; then
  echo "   没有现有角色，创建测试角色..."

  CREATE_CHAR_RESPONSE=$(curl -s -X POST "$API_BASE/characters" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{
      "name": "测试角色",
      "description": "用于测试的角色",
      "visibility": "private"
    }')

  CHARACTER_ID=$(echo "$CREATE_CHAR_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

  if [ -z "$CHARACTER_ID" ]; then
    echo "❌ 创建角色失败"
    echo "响应: $CREATE_CHAR_RESPONSE"
    exit 1
  fi

  echo "✅ 角色创建成功: $CHARACTER_ID"
else
  echo "✅ 找到现有角色: $CHARACTER_ID"
fi

echo ""

# 4. 创建聊天（带 personaId）
echo "4. 创建聊天（关联 Persona）..."
CHAT_RESPONSE=$(curl -s -X POST "$API_BASE/chats" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"characterId\": \"$CHARACTER_ID\",
    \"personaId\": \"$PERSONA_ID\",
    \"title\": \"Persona 测试聊天\"
  }")

CHAT_ID=$(echo "$CHAT_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$CHAT_ID" ]; then
  echo "❌ 创建聊天失败"
  echo "响应: $CHAT_RESPONSE"
  exit 1
fi

echo "✅ 聊天创建成功: $CHAT_ID"
echo ""

# 5. 验证 personaId 是否保存
echo "5. 验证 personaId 是否正确保存..."
CHAT_DETAIL=$(curl -s -X GET "$API_BASE/chats/$CHAT_ID" \
  -H "Authorization: Bearer $TOKEN")

# 检查响应中是否包含 personaId
if echo "$CHAT_DETAIL" | grep -q "\"personaId\":\"$PERSONA_ID\""; then
  echo "✅ personaId 正确保存！"
  echo ""
  echo "=== 测试成功 ==="
  echo ""
  echo "📊 测试结果:"
  echo "   Persona ID: $PERSONA_ID"
  echo "   Persona 名称: 凡音"
  echo "   角色 ID: $CHARACTER_ID"
  echo "   聊天 ID: $CHAT_ID"
  echo "   personaId 已保存: ✅"
  echo ""
  echo "💡 在聊天中，{{user}} 宏会被替换为 '凡音'"
  echo ""
  exit 0
else
  echo "❌ personaId 未正确保存"
  echo ""
  echo "期望在响应中找到: \"personaId\":\"$PERSONA_ID\""
  echo "实际响应:"
  echo "$CHAT_DETAIL"
  echo ""
  exit 1
fi
