/**
 * Test Client for AI-ICP-Assistant API
 * 
 * Run this script to test the API endpoints
 * Make sure the server is running first: npm start
 */

const BASE_URL = 'http://localhost:3005';

async function testChat() {
  console.log('\n🧪 Testing Chat Endpoint...');
  
  try {
    const response = await fetch(`${BASE_URL}/api/ai-icp-assistant/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'Help me find SaaS companies in fintech',
        conversationHistory: []
      })
    });

    const data = await response.json();
    console.log('✅ Chat Response:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('❌ Chat Error:', error.message);
  }
}

async function testKeywordExpansion() {
  console.log('\n🧪 Testing Keyword Expansion...');
  
  try {
    const response = await fetch(`${BASE_URL}/api/ai-icp-assistant/expand-keywords`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        topic: 'fintech startup'
      })
    });

    const data = await response.json();
    console.log('✅ Keywords:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('❌ Keywords Error:', error.message);
  }
}

async function testHealth() {
  console.log('\n🧪 Testing Health Endpoint...');
  
  try {
    const response = await fetch(`${BASE_URL}/health`);
    const data = await response.json();
    console.log('✅ Health:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('❌ Health Error:', error.message);
  }
}

async function runTests() {
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 AI-ICP-Assistant API Tests');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await testHealth();
  await testKeywordExpansion();
  await testChat();

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Tests Complete');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
}

runTests();
