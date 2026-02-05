#!/usr/bin/env python3
"""
Phase 5.1 认证系统测试
测试注册、登录、认证状态持久化和登出流程
"""

from playwright.sync_api import sync_playwright
import json
import time
from datetime import datetime

# 测试配置
BASE_URL = "http://localhost:5175"
API_BASE = "http://localhost:3000/api/v1"

# 生成唯一测试账号
TIMESTAMP = datetime.now().strftime("%Y%m%d%H%M%S")
TEST_USERNAME = f"testuser_{TIMESTAMP}"
TEST_EMAIL = f"test{TIMESTAMP}@example.com"
TEST_PASSWORD = "Test123456"

# 测试结果存储
test_results = {
    "timestamp": datetime.now().isoformat(),
    "test_account": {
        "username": TEST_USERNAME,
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD,
    },
    "results": {}
}

console_logs = []
network_requests = []

def console_handler(msg):
    """捕获浏览器控制台日志"""
    console_logs.append({
        "type": msg.type,
        "text": msg.text
    })
    if msg.type == "error":
        print(f"[Console Error] {msg.text}")

def network_handler(request):
    """捕获网络请求"""
    network_requests.append({
        "url": request.url,
        "method": request.method
    })

def save_test_results():
    """保存测试结果"""
    with open("/tmp/auth_test_results.json", "w") as f:
        json.dump(test_results, f, indent=2)
    print(f"\n测试结果已保存到 /tmp/auth_test_results.json")

def test_registration(page):
    """测试 1: 注册流程"""
    print("\n" + "="*60)
    print("测试 1: 注册流程")
    print("="*60)

    result = {
        "steps": [],
        "status": "pending",
        "issues": []
    }

    try:
        # 步骤 1: 访问注册页面
        step = {"name": "访问注册页面", "status": "pending"}
        page.goto(f"{BASE_URL}/register", wait_until="networkidle")
        page.wait_for_timeout(1000)
        print(f"  ✓ 当前 URL: {page.url}")
        step["status"] = "passed"
        result["steps"].append(step)

        # 步骤 2: 截图并检查表单
        step = {"name": "检查注册表单", "status": "pending"}
        page.screenshot(path="/tmp/1_register_page.png")
        print(f"  ✓ 截图已保存: /tmp/1_register_page.png")

        # 查找表单输入框
        username_input = page.locator('input[name="username"], input[placeholder*="用户"], input[placeholder*="username"]').first
        email_input = page.locator('input[name="email"], input[type="email"]').first
        password_input = page.locator('input[name="password"], input[type="password"]').first

        # 尝试多种可能的定位方式
        if username_input.count() == 0:
            username_input = page.locator('input').filter(has_text="用户名").first
        if email_input.count() == 0:
            email_input = page.locator('input').filter(has_text="邮箱").first

        print(f"  ✓ 找到输入框: 用户名({username_input.count()>0}), 邮箱({email_input.count()>0}), 密码({password_input.count()>0})")
        step["status"] = "passed"
        result["steps"].append(step)

        # 步骤 3: 填写表单
        step = {"name": "填写注册表单", "status": "pending"}
        username_input.fill(TEST_USERNAME)
        email_input.fill(TEST_EMAIL)
        password_input.fill(TEST_PASSWORD)
        print(f"  ✓ 表单已填写: {TEST_USERNAME}")
        step["status"] = "passed"
        result["steps"].append(step)

        # 步骤 4: 提交表单
        step = {"name": "提交注册表单", "status": "pending"}

        # 查找提交按钮
        submit_button = page.locator('button:has-text("注册"), button[type="submit"], button.el-button--primary').first
        print(f"  找到注册按钮: {submit_button.count() > 0}")

        # 截图提交前状态
        page.screenshot(path="/tmp/2_before_submit.png")

        # 等待可能出现的响应
        submit_button.click()
        page.wait_for_timeout(2000)
        page.wait_for_load_state("networkidle")

        step["status"] = "passed"
        result["steps"].append(step)

        # 步骤 5: 验证注册结果
        step = {"name": "验证注册结果", "status": "pending"}
        page.screenshot(path="/tmp/3_after_register.png")

        # 检查是否跳转或有成功提示
        current_url = page.url
        print(f"  ✓ 注册后 URL: {current_url}")

        # 检查 localStorage
        storage = page.evaluate("""() => {
            return {
                token: localStorage.getItem('token'),
                refreshToken: localStorage.getItem('refreshToken'),
                tenantId: localStorage.getItem('tenantId')
            };
        }""")

        print(f"  ✓ localStorage 内容:")
        print(f"    - token: {storage.get('token', 'N/A')[:20] if storage.get('token') else 'N/A'}...")
        print(f"    - refreshToken: {storage.get('refreshToken', 'N/A')[:20] if storage.get('refreshToken') else 'N/A'}...")
        print(f"    - tenantId: {storage.get('tenantId', 'N/A')}")

        result["storage"] = storage

        # 判断注册是否成功
        has_token = storage.get('token') is not None
        has_tenant_id = storage.get('tenantId') is not None

        if has_token and has_tenant_id:
            result["status"] = "passed"
            test_results["test_account"]["tenantId"] = storage.get('tenantId')
            step["status"] = "passed"
            print(f"  ✓ 注册成功！租户ID: {storage.get('tenantId')}")
        else:
            result["status"] = "failed"
            step["status"] = "failed"
            result["issues"].append("注册后未获得 token 或 tenantId")

        result["steps"].append(step)

    except Exception as e:
        result["status"] = "failed"
        result["error"] = str(e)
        result["issues"].append(f"异常: {e}")
        print(f"  ✗ 测试异常: {e}")

    return result

def test_login(page):
    """测试 2: 登录流程"""
    print("\n" + "="*60)
    print("测试 2: 登录流程")
    print("="*60)

    result = {
        "steps": [],
        "status": "pending",
        "issues": []
    }

    try:
        # 先登出（如果已登录）
        page.goto(f"{BASE_URL}/login", wait_until="networkidle")
        page.wait_for_timeout(1000)

        # 步骤 1: 访问登录页面
        step = {"name": "访问登录页面", "status": "pending"}
        print(f"  ✓ 当前 URL: {page.url}")
        step["status"] = "passed"
        result["steps"].append(step)

        # 步骤 2: 检查登录表单
        step = {"name": "检查登录表单", "status": "pending"}
        page.screenshot(path="/tmp/4_login_page.png")

        # 查找登录输入框
        email_input = page.locator('input[name="email"], input[type="email"]').first
        password_input = page.locator('input[name="password"], input[type="password"]').first

        print(f"  ✓ 找到输入框: 邮箱({email_input.count()>0}), 密码({password_input.count()>0})")
        step["status"] = "passed"
        result["steps"].append(step)

        # 步骤 3: 填写登录表单
        step = {"name": "填写登录表单", "status": "pending"}
        email_input.fill(TEST_EMAIL)
        password_input.fill(TEST_PASSWORD)
        print(f"  ✓ 表单已填写: {TEST_EMAIL}")
        step["status"] = "passed"
        result["steps"].append(step)

        # 步骤 4: 提交登录
        step = {"name": "提交登录表单", "status": "pending"}
        submit_button = page.locator('button:has-text("登录"), button[type="submit"]').first

        page.screenshot(path="/tmp/5_before_login.png")
        submit_button.click()
        page.wait_for_timeout(2000)
        page.wait_for_load_state("networkidle")

        step["status"] = "passed"
        result["steps"].append(step)

        # 步骤 5: 验证登录结果
        step = {"name": "验证登录结果", "status": "pending"}
        page.screenshot(path="/tmp/6_after_login.png")

        current_url = page.url
        print(f"  ✓ 登录后 URL: {current_url}")

        storage = page.evaluate("""() => {
            return {
                token: localStorage.getItem('token'),
                refreshToken: localStorage.getItem('refreshToken'),
                tenantId: localStorage.getItem('tenantId')
            };
        }""")

        print(f"  ✓ localStorage 内容:")
        print(f"    - token: {storage.get('token', 'N/A')[:20] if storage.get('token') else 'N/A'}...")
        print(f"    - tenantId: {storage.get('tenantId', 'N/A')}")

        result["storage"] = storage

        if storage.get('token'):
            result["status"] = "passed"
            step["status"] = "passed"
            print(f"  ✓ 登录成功！")
        else:
            result["status"] = "failed"
            step["status"] = "failed"
            result["issues"].append("登录后未获得 token")

        result["steps"].append(step)

    except Exception as e:
        result["status"] = "failed"
        result["error"] = str(e)
        result["issues"].append(f"异常: {e}")
        print(f"  ✗ 测试异常: {e}")

    return result

def test_auth_persistence(page):
    """测试 3: 认证状态持久化"""
    print("\n" + "="*60)
    print("测试 3: 认证状态持久化")
    print("="*60)

    result = {
        "steps": [],
        "status": "pending",
        "issues": []
    }

    try:
        # 步骤 1: 确保已登录
        step = {"name": "确保已登录状态", "status": "pending"}
        storage = page.evaluate("""() => {
            return {
                token: localStorage.getItem('token'),
                tenantId: localStorage.getItem('tenantId')
            };
        }""")

        if not storage.get('token'):
            print("  ⚠️ 未登录，先执行登录")
            login_result = test_login(page)
            result["status"] = login_result["status"]
            return result

        print(f"  ✓ 已登录，token 存在")
        step["status"] = "passed"
        result["steps"].append(step)

        # 步骤 2: 刷新页面
        step = {"name": "刷新页面", "status": "pending"}
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(1000)
        page.screenshot(path="/tmp/7_after_reload.png")
        step["status"] = "passed"
        result["steps"].append(step)

        # 步骤 3: 验证 token 仍然存在
        step = {"name": "验证认证状态保持", "status": "pending"}
        storage_after = page.evaluate("""() => {
            return {
                token: localStorage.getItem('token'),
                tenantId: localStorage.getItem('tenantId')
            };
        }""")

        print(f"  ✓ 刷新后 localStorage:")
        print(f"    - token: {storage_after.get('token', 'N/A')[:20] if storage_after.get('token') else 'N/A'}...")
        print(f"    - tenantId: {storage_after.get('tenantId', 'N/A')}")

        if storage_after.get('token'):
            result["status"] = "passed"
            step["status"] = "passed"
            print(f"  ✓ 认证状态持久化成功")
        else:
            result["status"] = "failed"
            step["status"] = "failed"
            result["issues"].append("刷新后 token 丢失")

        result["steps"].append(step)

    except Exception as e:
        result["status"] = "failed"
        result["error"] = str(e)
        result["issues"].append(f"异常: {e}")
        print(f"  ✗ 测试异常: {e}")

    return result

def test_logout(page):
    """测试 4: 登出流程"""
    print("\n" + "="*60)
    print("测试 4: 登出流程")
    print("="*60)

    result = {
        "steps": [],
        "status": "pending",
        "issues": []
    }

    try:
        # 步骤 1: 确保已登录
        step = {"name": "确保已登录状态", "status": "pending"}
        storage = page.evaluate("""() => {
            return {
                token: localStorage.getItem('token'),
                tenantId: localStorage.getItem('tenantId')
            };
        }""")

        if not storage.get('token'):
            print("  ⚠️ 未登录，先执行登录")
            login_result = test_login(page)
            result["status"] = login_result["status"]
            return result

        print(f"  ✓ 已登录")
        step["status"] = "passed"
        result["steps"].append(step)

        # 步骤 2: 查找并点击用户菜单/登出
        step = {"name": "查找登出按钮", "status": "pending"}
        page.screenshot(path="/tmp/8_before_logout.png")

        # 尝试多种可能的登出按钮定位方式
        logout_button = page.locator('button:has-text("退出"), a:has-text("退出"), button:has-text("登出"), a:has-text("登出")').first

        if logout_button.count() == 0:
            # 尝试查找用户头像/菜单按钮
            user_menu = page.locator('.el-dropdown, [class*="user"], [class*="avatar"], button[aria-label*="用户"]').first
            if user_menu.count() > 0:
                user_menu.click()
                page.wait_for_timeout(500)
                logout_button = page.locator('button:has-text("退出"), a:has-text("退出")').first

        print(f"  找到登出按钮: {logout_button.count() > 0}")
        step["status"] = "passed"
        result["steps"].append(step)

        # 步骤 3: 点击登出
        step = {"name": "点击登出", "status": "pending"}
        if logout_button.count() > 0:
            logout_button.click()
            page.wait_for_timeout(2000)
            page.wait_for_load_state("networkidle")
            step["status"] = "passed"
        else:
            step["status"] = "skipped"
            result["issues"].append("未找到登出按钮")

        result["steps"].append(step)

        # 步骤 4: 验证登出结果
        step = {"name": "验证登出结果", "status": "pending"}
        page.screenshot(path="/tmp/9_after_logout.png")

        current_url = page.url
        print(f"  ✓ 登出后 URL: {current_url}")

        storage_after = page.evaluate("""() => {
            return {
                token: localStorage.getItem('token'),
                refreshToken: localStorage.getItem('refreshToken'),
                tenantId: localStorage.getItem('tenantId')
            };
        }""")

        print(f"  ✓ localStorage 内容:")
        print(f"    - token: {storage_after.get('token', 'N/A')}")
        print(f"    - refreshToken: {storage_after.get('refreshToken', 'N/A')}")
        print(f"    - tenantId: {storage_after.get('tenantId', 'N/A')}")

        result["storage_after"] = storage_after

        is_cleared = (not storage_after.get('token') and
                     not storage_after.get('refreshToken') and
                     not storage_after.get('tenantId'))

        if is_cleared:
            result["status"] = "passed"
            step["status"] = "passed"
            print(f"  ✓ 登出成功！localStorage 已清空")
        else:
            result["status"] = "failed"
            step["status"] = "failed"
            result["issues"].append("登出后 localStorage 未完全清空")

        result["steps"].append(step)

    except Exception as e:
        result["status"] = "failed"
        result["error"] = str(e)
        result["issues"].append(f"异常: {e}")
        print(f"  ✗ 测试异常: {e}")

    return result

def print_summary():
    """打印测试摘要"""
    print("\n" + "="*60)
    print("测试摘要")
    print("="*60)

    for test_name, result in test_results["results"].items():
        status_icon = "✅" if result["status"] == "passed" else "❌"
        print(f"\n{status_icon} {test_name}: {result['status']}")
        if result.get("issues"):
            print(f"  问题:")
            for issue in result["issues"]:
                print(f"    - {issue}")

    print("\n" + "="*60)
    print(f"测试账号: {TEST_EMAIL}")
    print(f"测试密码: {TEST_PASSWORD}")
    print("="*60)

def main():
    """主测试函数"""
    print("="*60)
    print("Phase 5.1 认证系统测试")
    print("="*60)
    print(f"测试时间: {datetime.now().isoformat()}")
    print(f"前端地址: {BASE_URL}")
    print(f"测试账号: {TEST_EMAIL}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)  # 使用非 headless 模式以便调试
        context = browser.new_context(
            viewport={'width': 1280, 'height': 720}
        )
        page = context.new_page()

        # 监听控制台和网络
        page.on('console', console_handler)
        page.on('request', network_handler)

        try:
            # 执行测试
            test_results["results"]["1. 注册流程"] = test_registration(page)
            test_results["results"]["2. 登录流程"] = test_login(page)
            test_results["results"]["3. 认证状态持久化"] = test_auth_persistence(page)
            test_results["results"]["4. 登出流程"] = test_logout(page)

            print_summary()
            save_test_results()

        finally:
            browser.close()

if __name__ == "__main__":
    main()
