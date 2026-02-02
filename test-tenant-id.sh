#!/bin/bash

# 测试租户 ID 功能

echo "=================================="
echo "测试租户 ID 功能"
echo "=================================="
echo ""

BASE_URL="http://localhost:3000"
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

# 1. 注册新用户
echo "1️⃣  注册新用户..."
RANDOM_EMAIL="tenant_test_$(date +%s)@example.com"
REGISTER_DATA="{\"email\":\"$RANDOM_EMAIL\",\"password\":\"Test123456\",\"name\":\"租户测试\"}"

response=$(curl -s -w "\n%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -d "$REGISTER_DATA" \
    "$BASE_URL/api/v1/auth/register")

status_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n-1)

if [ "$status_code" = "201" ]; then
    echo -e "${GREEN}✓ 注册成功${NC}"

    # 提取 token 和 tenantId
    TOKEN=$(echo "$body" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
    TENANT_ID=$(echo "$body" | grep -o '"tenantId":"[^"]*"' | cut -d'"' -f4)

    echo "  Token: ${TOKEN:0:20}..."
    echo "  Tenant ID: $TENANT_ID"
else
    echo -e "${RED}✗ 注册失败 (状态码: $status_code)${NC}"
    echo "  响应: $body"
    exit 1
fi

echo ""

# 2. 测试带租户 ID 的 API 调用
echo "2️⃣  测试带租户 ID 的 API 调用..."

response=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: Bearer $TOKEN" \
    -H "X-Tenant-ID: $TENANT_ID" \
    "$BASE_URL/api/v1/auth/me")

status_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n-1)

if [ "$status_code" = "200" ]; then
    echo -e "${GREEN}✓ API 调用成功${NC}"
    echo "  响应: ${body:0:100}..."
else
    echo -e "${RED}✗ API 调用失败 (状态码: $status_code)${NC}"
    echo "  响应: $body"
    exit 1
fi

echo ""

# 3. 测试没有租户 ID 的情况
echo "3️⃣  测试没有租户 ID 的情况（应该失败）..."

response=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: Bearer $TOKEN" \
    "$BASE_URL/api/v1/characters")

status_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n-1)

if [ "$status_code" = "400" ]; then
    echo -e "${GREEN}✓ 正确拒绝了没有租户 ID 的请求${NC}"
    echo "  错误信息: $(echo "$body" | grep -o '"message":"[^"]*"' | cut -d'"' -f4)"
else
    echo -e "${RED}✗ 应该返回 400 错误，但返回了 $status_code${NC}"
    echo "  响应: $body"
fi

echo ""
echo "=================================="
echo "测试完成"
echo "=================================="
echo ""
echo "📝 总结："
echo "  - 用户邮箱: $RANDOM_EMAIL"
echo "  - 租户 ID: $TENANT_ID"
echo "  - Token: ${TOKEN:0:30}..."
echo ""
echo "💡 前端应该在登录/注册后自动保存 tenantId 到 localStorage"
echo "   然后在每个 API 请求中添加 X-Tenant-ID 请求头"
