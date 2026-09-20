#!/bin/bash

# Test Character Parameter Tuning System
set -e

API_BASE="http://localhost:3000/api/v1"
TOKEN=""

echo "=== Character Parameter Tuning Test ==="
echo ""

# 1. Login
echo "1. Logging in..."
LOGIN_RESPONSE=$(curl -s -X POST "$API_BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "tuning-test@example.com",
    "password": "Test123456"
  }')

TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ Login failed"
  echo "Response: $LOGIN_RESPONSE"
  exit 1
fi

echo "✅ Logged in successfully"
echo ""

# 2. Get or create a character
echo "2. Getting test character..."
CHARACTERS_RESPONSE=$(curl -s -X GET "$API_BASE/characters?limit=1" \
  -H "Authorization: Bearer $TOKEN")

CHARACTER_ID=$(echo "$CHARACTERS_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$CHARACTER_ID" ]; then
  echo "❌ No characters found"
  exit 1
fi

echo "✅ Found character: $CHARACTER_ID"
echo ""

# 3. Create a preset
echo "3. Creating parameter preset..."
PRESET_RESPONSE=$(curl -s -X POST "$API_BASE/presets" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "简短回复模式",
    "description": "适合快速对话，回复更简洁",
    "preset": {
      "system_prompt": "请用简短的语言回复，每次回复不超过50字。",
      "post_history_instructions": "保持简洁。"
    },
    "isGlobal": true
  }')

PRESET_ID=$(echo "$PRESET_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$PRESET_ID" ]; then
  echo "❌ Failed to create preset"
  echo "Response: $PRESET_RESPONSE"
  exit 1
fi

echo "✅ Preset created: $PRESET_ID"
echo ""

# 4. List presets
echo "4. Listing presets..."
PRESETS_LIST=$(curl -s -X GET "$API_BASE/presets" \
  -H "Authorization: Bearer $TOKEN")

echo "✅ Presets retrieved"
echo ""

# 5. Create a chat
echo "5. Creating test chat..."
CHAT_RESPONSE=$(curl -s -X POST "$API_BASE/chats" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"characterId\": \"$CHARACTER_ID\",
    \"title\": \"Parameter Tuning Test\"
  }")

CHAT_ID=$(echo "$CHAT_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$CHAT_ID" ]; then
  echo "❌ Failed to create chat"
  echo "Response: $CHAT_RESPONSE"
  exit 1
fi

echo "✅ Chat created: $CHAT_ID"
echo ""

# 6. Apply parameter override to chat
echo "6. Applying parameter override..."
OVERRIDE_RESPONSE=$(curl -s -X PUT "$API_BASE/chats/$CHAT_ID/overrides" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "overrides": {
      "personality": "更加友善和耐心",
      "scenario": "在咖啡厅的轻松对话",
      "system_prompt": "你现在处于放松模式，回复更加简短"
    },
    "enabled": true,
    "note": "测试参数覆盖"
  }')

OVERRIDE_ID=$(echo "$OVERRIDE_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$OVERRIDE_ID" ]; then
  echo "❌ Failed to create override"
  echo "Response: $OVERRIDE_RESPONSE"
  exit 1
fi

echo "✅ Override applied: $OVERRIDE_ID"
echo ""

# 7. Get override
echo "7. Verifying override..."
GET_OVERRIDE=$(curl -s -X GET "$API_BASE/chats/$CHAT_ID/overrides" \
  -H "Authorization: Bearer $TOKEN")

if echo "$GET_OVERRIDE" | grep -q "\"enabled\":true"; then
  echo "✅ Override is enabled"
else
  echo "❌ Override not found or disabled"
  echo "Response: $GET_OVERRIDE"
  exit 1
fi

echo ""

# 8. Toggle override off
echo "8. Disabling override..."
TOGGLE_RESPONSE=$(curl -s -X PATCH "$API_BASE/chats/$CHAT_ID/overrides/toggle" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "enabled": false
  }')

if echo "$TOGGLE_RESPONSE" | grep -q "\"enabled\":false"; then
  echo "✅ Override disabled"
else
  echo "❌ Failed to disable override"
  exit 1
fi

echo ""

# 9. Toggle override back on
echo "9. Re-enabling override..."
TOGGLE_RESPONSE=$(curl -s -X PATCH "$API_BASE/chats/$CHAT_ID/overrides/toggle" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "enabled": true
  }')

if echo "$TOGGLE_RESPONSE" | grep -q "\"enabled\":true"; then
  echo "✅ Override re-enabled"
else
  echo "❌ Failed to re-enable override"
  exit 1
fi

echo ""
echo "=== All Tests Passed ==="
echo ""
echo "📊 Test Summary:"
echo "   Preset ID: $PRESET_ID"
echo "   Character ID: $CHARACTER_ID"
echo "   Chat ID: $CHAT_ID"
echo "   Override ID: $OVERRIDE_ID"
echo ""
echo "✅ Character parameter tuning system is working!"
echo ""
echo "💡 Next steps:"
echo "   - Send a message in the chat to see the overrides in action"
echo "   - Create more presets for different scenarios"
echo "   - Build the frontend UI for parameter adjustment"
