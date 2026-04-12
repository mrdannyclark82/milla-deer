#!/usr/bin/env python3
"""
Elara AI Backend API Testing Suite
Tests all backend endpoints for functionality and integration
"""

import requests
import json
import sys
import time
from datetime import datetime

class ElaraAPITester:
    def __init__(self, base_url="https://20b88fc1-ed52-43d1-9301-f80517690586.preview.emergentagent.com"):
        self.base_url = base_url
        self.session = requests.Session()
        self.session.headers.update({'Content-Type': 'application/json'})
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []
        self.admin_credentials = {"email": "admin@elara.ai", "password": "admin123"}

    def log(self, message, level="INFO"):
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {level}: {message}")

    def run_test(self, name, method, endpoint, expected_status, data=None, auth_required=False):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        self.tests_run += 1
        
        self.log(f"Testing {name} - {method} {endpoint}")
        
        try:
            if method == 'GET':
                response = self.session.get(url)
            elif method == 'POST':
                response = self.session.post(url, json=data)
            elif method == 'PUT':
                response = self.session.put(url, json=data)
            elif method == 'DELETE':
                response = self.session.delete(url)
            else:
                raise ValueError(f"Unsupported method: {method}")

            success = response.status_code == expected_status
            
            if success:
                self.tests_passed += 1
                self.log(f"✅ PASS - {name} - Status: {response.status_code}", "PASS")
                try:
                    return True, response.json() if response.content else {}
                except:
                    return True, {}
            else:
                self.failed_tests.append({
                    "test": name,
                    "endpoint": endpoint,
                    "expected": expected_status,
                    "actual": response.status_code,
                    "response": response.text[:200] if response.text else "No response"
                })
                self.log(f"❌ FAIL - {name} - Expected {expected_status}, got {response.status_code}", "FAIL")
                self.log(f"Response: {response.text[:200]}", "ERROR")
                return False, {}

        except Exception as e:
            self.failed_tests.append({
                "test": name,
                "endpoint": endpoint,
                "error": str(e)
            })
            self.log(f"❌ ERROR - {name} - {str(e)}", "ERROR")
            return False, {}

    def test_health_endpoint(self):
        """Test health check endpoint"""
        return self.run_test("Health Check", "GET", "/api/health", 200)

    def test_admin_login(self):
        """Test admin login"""
        success, response = self.run_test(
            "Admin Login",
            "POST", 
            "/api/auth/login",
            200,
            data=self.admin_credentials
        )
        if success and 'id' in response:
            self.log(f"Admin login successful - User ID: {response.get('id')}")
            return True, response
        return False, {}

    def test_user_registration(self):
        """Test user registration with unique email"""
        test_email = f"test_user_{int(time.time())}@test.com"
        test_data = {
            "email": test_email,
            "password": "testpass123",
            "name": "Test User"
        }
        
        success, response = self.run_test(
            "User Registration",
            "POST",
            "/api/auth/register", 
            200,
            data=test_data
        )
        
        if success:
            self.log(f"Registration successful - New user: {test_email}")
            return True, response
        return False, {}

    def test_auth_me(self):
        """Test getting current user info"""
        return self.run_test("Get Current User", "GET", "/api/auth/me", 200)

    def test_chat_endpoint(self):
        """Test chat functionality with GPT-5.2"""
        chat_data = {
            "message": "Hello Elara, this is a test message. Please respond briefly.",
            "persona": "Professional",
            "tool_mode": "chat"
        }
        
        self.log("Testing chat endpoint - this may take a few seconds for AI response...")
        success, response = self.run_test(
            "Chat with AI",
            "POST",
            "/api/chat",
            200,
            data=chat_data
        )
        
        if success and 'content' in response:
            self.log(f"AI Response received: {response['content'][:100]}...")
            return True, response
        return False, {}

    def test_metrics_endpoint(self):
        """Test metrics retrieval"""
        return self.run_test("Get Metrics", "GET", "/api/metrics", 200)

    def test_knowledge_endpoints(self):
        """Test knowledge base operations"""
        # Get knowledge
        get_success, _ = self.run_test("Get Knowledge", "GET", "/api/knowledge", 200)
        
        # Add knowledge
        kb_data = {"content": "Test knowledge entry for API testing"}
        add_success, _ = self.run_test(
            "Add Knowledge",
            "POST", 
            "/api/knowledge",
            200,
            data=kb_data
        )
        
        return get_success and add_success

    def test_growth_endpoints(self):
        """Test growth log operations"""
        # Get growth log
        get_success, _ = self.run_test("Get Growth Log", "GET", "/api/growth", 200)
        
        # Add growth entry
        growth_data = {
            "type": "learning",
            "title": "API Test Entry",
            "details": "Test growth log entry from automated testing"
        }
        add_success, _ = self.run_test(
            "Add Growth Entry",
            "POST",
            "/api/growth", 
            200,
            data=growth_data
        )
        
        return get_success and add_success

    def test_preferences_endpoints(self):
        """Test user preference updates"""
        # Test theme update
        theme_success, _ = self.run_test(
            "Update Theme",
            "PUT",
            "/api/preferences/theme",
            200,
            data={"theme": "cyberpunk"}
        )
        
        # Test persona update  
        persona_success, _ = self.run_test(
            "Update Persona",
            "PUT",
            "/api/preferences/persona",
            200,
            data={"persona": "Casual"}
        )
        
        return theme_success and persona_success

    def test_chat_history(self):
        """Test chat history operations"""
        # Get chat history
        get_success, _ = self.run_test("Get Chat History", "GET", "/api/chat/history", 200)
        
        # Clear chat history
        clear_success, _ = self.run_test("Clear Chat History", "DELETE", "/api/chat/history", 200)
        
        return get_success and clear_success

    def test_logout(self):
        """Test logout functionality"""
        return self.run_test("Logout", "POST", "/api/auth/logout", 200)

    def run_all_tests(self):
        """Run complete test suite"""
        self.log("🚀 Starting Elara AI Backend API Test Suite")
        self.log(f"Testing against: {self.base_url}")
        
        # Test 1: Health check (no auth required)
        self.log("\n=== Testing Health Endpoint ===")
        self.test_health_endpoint()
        
        # Test 2: Admin login (establishes session)
        self.log("\n=== Testing Authentication ===")
        login_success, admin_user = self.test_admin_login()
        
        if not login_success:
            self.log("❌ Admin login failed - cannot continue with authenticated tests", "CRITICAL")
            return self.generate_report()
        
        # Test 3: Auth me endpoint
        self.test_auth_me()
        
        # Test 4: User registration (creates new session)
        self.test_user_registration()
        
        # Re-login as admin for remaining tests
        self.test_admin_login()
        
        # Test 5: Chat functionality
        self.log("\n=== Testing AI Chat Integration ===")
        self.test_chat_endpoint()
        
        # Test 6: Metrics
        self.log("\n=== Testing Metrics ===")
        self.test_metrics_endpoint()
        
        # Test 7: Knowledge base
        self.log("\n=== Testing Knowledge Base ===")
        self.test_knowledge_endpoints()
        
        # Test 8: Growth log
        self.log("\n=== Testing Growth Log ===")
        self.test_growth_endpoints()
        
        # Test 9: Preferences
        self.log("\n=== Testing User Preferences ===")
        self.test_preferences_endpoints()
        
        # Test 10: Chat history
        self.log("\n=== Testing Chat History ===")
        self.test_chat_history()
        
        # Test 11: Logout
        self.log("\n=== Testing Logout ===")
        self.test_logout()
        
        return self.generate_report()

    def generate_report(self):
        """Generate test report"""
        self.log("\n" + "="*60)
        self.log("🏁 TEST SUITE COMPLETED")
        self.log("="*60)
        
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        
        self.log(f"📊 Results: {self.tests_passed}/{self.tests_run} tests passed ({success_rate:.1f}%)")
        
        if self.failed_tests:
            self.log("\n❌ Failed Tests:")
            for failure in self.failed_tests:
                error_msg = failure.get('error', f"Expected {failure.get('expected')}, got {failure.get('actual')}")
                self.log(f"  - {failure['test']}: {error_msg}")
        else:
            self.log("✅ All tests passed!")
        
        return {
            "total_tests": self.tests_run,
            "passed_tests": self.tests_passed,
            "failed_tests": len(self.failed_tests),
            "success_rate": success_rate,
            "failures": self.failed_tests
        }

def main():
    """Main test execution"""
    tester = ElaraAPITester()
    results = tester.run_all_tests()
    
    # Return appropriate exit code
    return 0 if results["failed_tests"] == 0 else 1

if __name__ == "__main__":
    sys.exit(main())