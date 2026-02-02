#!/bin/bash

# Small Squaretable - 认证 UI 测试脚本
# 测试登录和注册功能

echo "=================================="
echo "Small Squaretable 认证 UI 测试"
echo "=================================="
echo ""

BASE_URL="http://localhost:3000"

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试计数
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# 测试函数
test_endpoint() {
    local name=$1
    local method=$2
    local endpoint=$3
    local data=$4
    local expected_status=$5

    TOTAL_TESTS=$((TOTAL_TESTS + 1))

    echo -n "测试 $TOTAL_TESTS: $name ... "

    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" "$BASE_URL$endpoint")
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" \
            -H "Content-Type: application/json" \
            -d "$data" \
            "$BASE_URL$endpoint")
    fi

    status_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n-1)

    if [ "$status_code" = "$expected_status" ]; then
        echo -e "${GREEN}✓ 通过${NC} (状态码: $status_code)"
        PASSED_TESTS=$((PASSED_TESTS + 1))
        return 0
    else
        echo -e "${RED}✗ 失败${NC} (期望: $expected_status, 实际: $status_code)"
        echo "  响应: $body"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        return 1
    fi
}

echo "1️⃣  测试服务器健康检查"
echo "-----------------------------------"
test_endpoint "健康检查" "GET" "/health" "" "200"
echo ""

echo "2️⃣  测试注册 API"
echo "-----------------------------------"
# 生成随机邮箱避免冲突
RANDOM_EMAIL="test_$(date +%s)@example.com"
REGISTER_DATA="{\"email\":\"$RANDOM_EMAIL\",\"password\":\"Test123456\",\"name\":\"测试用户\"}"

test_endpoint "用户注册" "POST" "/api/v1/auth/register" "$REGISTER_DATA" "201"

# 保存 token
if [ $? -eq 0 ]; then
    TOKEN=$(echo "$body" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
    echo "  📝 Token 已保存"
fi
echo ""

echo "3️⃣  测试登录 API"
echo "-----------------------------------"
LOGIN_DATA="{\"email\":\"$RANDOM_EMAIL\",\"password\":\"Test123456\"}"
test_endpoint "用户登录" "POST" "/api/v1/auth/login" "$LOGIN_DATA" "200"

# 更新 token
if [ $? -eq 0 ]; then
    TOKEN=$(echo "$body" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
    echo "  📝 Token 已更新"
fi
echo ""

echo "4️⃣  测试认证保护的端点"
echo "-----------------------------------"
if [ -n "$TOKEN" ]; then
    echo -n "测试 $((TOTAL_TESTS + 1)): 获取用户信息 ... "
    TOTAL_TESTS=$((TOTAL_TESTS + 1))

    response=$(curl -s -w "\n%{http_code}" \
        -H "Authorization: Bearer $TOKEN" \
        "$BASE_URL/api/v1/auth/me")

    status_code=$(echo "$response" | tail -n1)

    if [ "$status_code" = "200" ]; then
        echo -e "${GREEN}✓ 通过${NC} (状态码: $status_code)"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "${RED}✗ 失败${NC} (状态码: $status_code)"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
else
    echo -e "${YELLOW}⚠ 跳过 (未获取到 token)${NC}"
fi
echo ""

echo "5️⃣  测试错误处理"
echo "-----------------------------------"
INVALID_LOGIN="{\"email\":\"invalid@example.com\",\"password\":\"wrongpass\"}"
test_endpoint "无效登录" "POST" "/api/v1/auth/login" "$INVALID_LOGIN" "401"

DUPLICATE_REGISTER="{\"email\":\"$RANDOM_EMAIL\",\"password\":\"Test123456\",\"name\":\"重复用户\"}"
test_endpoint "重复注册" "POST" "/api/v1/auth/register" "$DUPLICATE_REGISTER" "400"
echo ""

echo "=================================="
echo "测试总结"
echo "=================================="
echo "总测试数: $TOTAL_TESTS"
echo -e "通过: ${GREEN}$PASSED_TESTS${NC}"
echo -e "失败: ${RED}$FAILED_TESTS${NC}"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}✓ 所有测试通过！${NC}"
    echo ""
    echo "🌐 前端页面访问地址："
    echo "   登录页面: http://localhost:3000/auth/login"
    echo "   注册页面: http://localhost:3000/auth/register"
    echo ""
    echo "💡 提示："
    echo "   - 在浏览器中打开上述地址测试 UI"
    echo "   - 使用邮箱: $RANDOM_EMAIL"
    echo "   - 使用密码: Test123456"
    exit 0
else
    echo -e "${RED}✗ 有测试失败${NC}"
    exit 1
fi
