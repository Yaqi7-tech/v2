// 直接测试Dify API连接
const fetch = require('node-fetch');

const API_CONFIG = {
    visitor: {
        url: 'http://dify.ai-role.cn/v1',
        key: 'app-ntJ0qX9eMENmHw8MVLaEue0L'
    },
    supervisor: {
        url: 'http://dify.ai-role.cn/v1',
        key: 'app-ql5TGDmm625kINtn9Y8JefJE'
    }
};

async function testAPI(config, name) {
    console.log(`\n=== 测试 ${name} API ===`);
    console.log('URL:', config.url);
    console.log('Key:', config.key.substring(0, 10) + '...');

    try {
        const response = await fetch(config.url + '/chat-messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.key}`,
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                inputs: {},
                query: '你好，这是测试消息',
                response_mode: 'blocking',
                conversation_id: '',
                user: 'test_user'
            })
        });

        console.log('响应状态:', response.status);
        console.log('响应头:', Object.fromEntries(response.headers));

        if (response.ok) {
            const data = await response.json();
            console.log('响应成功:', data);
        } else {
            const errorText = await response.text();
            console.error('响应失败:', response.status, errorText);
        }
    } catch (error) {
        console.error('请求失败:', error.message);
    }
}

// 测试两个API
async function runTests() {
    console.log('开始API连接测试...\n');

    await testAPI(API_CONFIG.visitor, '来访者');
    await testAPI(API_CONFIG.supervisor, '督导');

    console.log('\n测试完成');
}

runTests();