// API配置 - 自动检测环境
const API_CONFIG = {
    visitor: {
        url: (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
            ? 'http://localhost:3000/api'
            : '/api',
        key: 'app-ntJ0qX9eMENmHw8MVLaEue0L'
    },
    supervisor: {
        url: (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
            ? 'http://localhost:3000/api'
            : '/api',
        key: 'app-ql5TGDmm625kINtn9Y8JefJE'
    }
};

// 应用状态
let appState = {
    conversationStarted: false,
    conversationHistory: [],
    currentEvaluation: null,
    evaluationHistory: [],
    isProcessing: false,
    visitorConversationId: null,  // 来访者会话ID
    supervisorConversationId: null, // 督导会话ID
    usingSimulation: false, // 是否在使用模拟数据
    conversationSessions: [], // 对话会话历史
    currentSessionId: null, // 当前会话ID
    // 图表数据
    chartsData: {
        stage: [],
        emotionTimeline: [],
        stress: [],
        emotionIntensity: []
    },
    charts: {} // Chart.js 实例
};

// DOM元素
const elements = {
    chatContainer: document.getElementById('chatContainer'),
    userInput: document.getElementById('userInput'),
    startBtn: document.getElementById('startBtn'),
    sendBtn: document.getElementById('sendBtn'),
    status: document.getElementById('status'),
    evaluationContainer: document.getElementById('evaluationContainer'),
    historyList: document.getElementById('historyList'),
    conversationHistory: document.getElementById('conversationHistory'),
    conversationHistoryList: document.getElementById('conversationHistoryList'),
    historyToggleBtn: document.getElementById('historyToggleBtn'),
    clearBtn: document.getElementById('clearBtn'),
    // 图表Canvas元素
    stageChart: document.getElementById('stageChart'),
    emotionTimelineChart: document.getElementById('emotionTimelineChart'),
    stressChart: document.getElementById('stressChart'),
    emotionIntensityChart: document.getElementById('emotionIntensityChart')
};

// 调用Dify API
async function callDifyAPI(config, message, conversationId = null) {
    try {
        console.log('正在调用API:', config.url);
        console.log('发送消息:', message);
        console.log('使用会话ID:', conversationId);

        const requestBody = {
            inputs: {},
            query: message,
            response_mode: 'blocking',
            conversation_id: conversationId || '',
            user: 'counselor_user'
        };

        console.log('请求体:', requestBody);
        console.log('完整的请求URL:', config.url + '/chat-messages');
        console.log('使用的API密钥:', config.key.substring(0, 10) + '...');

        const response = await fetch(config.url + '/chat-messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.key}`,
                'Accept': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('API响应错误:', response.status, errorText);
            throw new Error(`API请求失败: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        console.log('API响应成功:', data);

        return {
            answer: data.answer,
            conversation_id: data.conversation_id
        };

    } catch (error) {
        console.error('API调用错误:', error);
        throw error;
    }
}

// 来访者Agent调用
async function callVisitorAgent(message) {
    const response = await callDifyAPI(API_CONFIG.visitor, message, appState.visitorConversationId);

    // 保存会话ID以保持连续性
    if (response.conversation_id) {
        appState.visitorConversationId = response.conversation_id;
        console.log('保存来访者会话ID:', response.conversation_id);
    }

    // 解析响应：分离文本和JSON数据
    let visitorText = response.answer;
    try {
        const jsonText = extractJsonObjectFromText(response.answer);
        if (jsonText) {
            console.log('提取到来访者数据JSON:', jsonText);
            const chartData = JSON.parse(jsonText);
            
            // 更新图表数据
            updateChartsData(chartData);
            
            // 从响应中移除JSON部分，只保留对话文本
            // 简单的替换可能不准确，如果JSON在中间或开头。这里假设JSON在末尾或独立块。
            // 更安全的做法是替换提取到的jsonText
            visitorText = response.answer.replace(jsonText, '').trim();
        }
    } catch (e) {
        console.warn('解析来访者数据JSON失败:', e);
        // 失败则忽略数据更新，只显示原始文本
    }

    return visitorText;
}

// 督导Agent调用
async function callSupervisorAgent(message) {
    const response = await callDifyAPI(API_CONFIG.supervisor, message, appState.supervisorConversationId);

    // 保存会话ID以保持连续性
    if (response.conversation_id) {
        appState.supervisorConversationId = response.conversation_id;
        console.log('保存督导会话ID:', response.conversation_id);
    }

    console.log('督导Agent原始响应:', response);
    console.log('督导响应answer内容:', response.answer);

    // 尝试解析JSON格式的评价
    try {
        // 先清理可能的格式问题
        let cleanAnswer = response.answer.trim();
        console.log('清理后的answer:', cleanAnswer);
        console.log('answer长度:', cleanAnswer.length);
        console.log('answer前10字符:', cleanAnswer.substring(0, 10));
        console.log('answer后10字符:', cleanAnswer.substring(Math.max(0, cleanAnswer.length - 10)));

        // 检查是否可能是JSON格式 - 更宽松的检测
        const hasJsonStructure =
            (cleanAnswer.includes('{') && cleanAnswer.includes('}')) ||
            (cleanAnswer.includes('"综合得分"') && cleanAnswer.includes('"总体评价"')) ||
            (cleanAnswer.includes('"跳步判断"'));

        if (hasJsonStructure) {
            console.log('检测到可能的JSON格式，尝试解析...');

            let evaluationData = null;
            try {
                evaluationData = JSON.parse(cleanAnswer);
                console.log('JSON.parse成功，督导评价:', evaluationData);
            } catch (parseError) {
                console.log('JSON.parse失败:', parseError.message);
                try {
                    const jsonText = extractJsonObjectFromText(cleanAnswer);
                    if (!jsonText) throw new Error('未找到JSON对象');
                    const cleanedJson = jsonText
                        .replace(/[\u0000-\u001F\u200B-\u200D\u202A-\u202E\u2060-\u206F\uFEFF]/g, '')
                        .trim();
                    console.log('提取到的JSON:', cleanedJson);
                    evaluationData = JSON.parse(cleanedJson);
                    console.log('清理后JSON.parse成功:', evaluationData);
                } catch (secondParseError) {
                    console.log('第二次JSON.parse也失败:', secondParseError.message);
                    throw secondParseError;
                }
            }

            if (evaluationData) {
                // 确保必要字段存在
                if (!evaluationData.综合得分) evaluationData.综合得分 = 3;
                if (!evaluationData.总体评价) evaluationData.总体评价 = '暂无评价';
                if (!evaluationData.建议) evaluationData.建议 = '请继续关注来访者的需求和感受。';
                if (!evaluationData.跳步判断) evaluationData.跳步判断 = {
                    是否跳步: false,
                    跳步类型: "无",
                    督导建议: "无跳步问题"
                };

                return evaluationData;
            } else {
                throw new Error('无法解析JSON格式');
            }
        } else {
            console.log('非JSON格式，创建默认评价结构');
            // 如果不是JSON格式，创建包含跳步判断的基本结构
            return {
                综合得分: 3,
                总体评价: cleanAnswer,
                建议: "请继续关注来访者的需求和感受。",
                跳步判断: {
                    是否跳步: false,
                    跳步类型: "无",
                    督导建议: "当前回复符合基本要求"
                }
            };
        }
    } catch (error) {
        console.error('督导评价解析失败:', error);
        console.error('原始answer内容:', response.answer);

        // 如果解析失败，返回默认格式的评价
        return {
            综合得分: 3,
            总体评价: response.answer,
            建议: "请继续关注来访者的需求和感受。",
            跳步判断: {
                是否跳步: false,
                跳步类型: "解析错误",
                督导建议: "评价格式解析出现问题，请检查API响应"
            }
        };
    }
}

// 更新状态显示
function updateStatus(message, type = 'normal') {
    elements.status.textContent = message;
    elements.status.style.backgroundColor = type === 'error' ? '#e74c3c' :
                                            type === 'processing' ? '#f39c12' : '#27ae60';
}

// 显示消息
function displayMessage(sender, content, type) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.innerHTML = `
        <div class="sender">${sender}</div>
        <div class="content">${content}</div>
    `;

    elements.chatContainer.appendChild(messageDiv);
    elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;

    // 添加到历史记录
    appState.conversationHistory.push({
        sender,
        content,
        type,
        timestamp: new Date()
    });
}

// 显示评价
function displayEvaluation(evaluation) {
    console.log('displayEvaluation收到的评价对象:', evaluation);

    appState.currentEvaluation = evaluation;
    appState.evaluationHistory.unshift({
        ...evaluation,
        timestamp: new Date()
    });

    // 确保评价对象结构完整
    const safeEvaluation = {
        综合得分: evaluation.综合得分 || 3,
        总体评价: evaluation.总体评价 || '暂无评价',
        建议: evaluation.建议 || '暂无建议',
        跳步判断: evaluation.跳步判断 || {
            是否跳步: false,
            跳步类型: "无",
            督导建议: "无跳步问题"
        }
    };

    console.log('处理后的评价对象:', safeEvaluation);

    // 解析跳步判断
    const skipStep = safeEvaluation.跳步判断 || {};
    const hasSkipStep = skipStep.是否跳步 || false;

    // 更新当前评价显示
    elements.evaluationContainer.innerHTML = `
        <div class="evaluation">
            <div class="evaluation-header">
                <div class="score ${getScoreClass(safeEvaluation.综合得分 || 3)}">${safeEvaluation.综合得分 || 3}</div>
                <div class="evaluation-title">督导评价</div>
            </div>
            <div class="evaluation-content">
                <div class="evaluation-section">
                    <strong>总体评价：</strong>
                    <div class="evaluation-text">${safeEvaluation.总体评价 || '暂无评价'}</div>
                </div>
            </div>
            <div class="evaluation-suggestions">
                <div class="evaluation-section">
                    <strong>建议：</strong>
                    <div class="evaluation-text">${safeEvaluation.建议 || '暂无建议'}</div>
                </div>
            </div>
            ${hasSkipStep ? `
                <div class="skip-step-warning">
                    <div class="skip-step-header">
                        <span class="warning-icon">⚠️</span>
                        <strong>跳步判断：${skipStep.跳步类型 || '未知类型'}</strong>
                    </div>
                    <div class="skip-step-detail">${skipStep.督导建议 || '暂无建议'}</div>
                </div>
            ` : `
                <div class="skip-step-success">
                    <span class="success-icon">✅</span>
                    <strong>节奏合适：未发现跳步问题</strong>
                </div>
            `}
        </div>
    `;

    // 更新历史评价
    updateEvaluationHistory();
}

// 根据得分获取样式类
function getScoreClass(score) {
    if (score >= 4) return 'score-high';
    if (score >= 3) return 'score-medium';
    return 'score-low';
}

// 更新历史评价显示
function updateEvaluationHistory() {
    if (appState.evaluationHistory.length === 0) {
        elements.historyList.innerHTML = '<div class="no-evaluation">暂无历史评价</div>';
        return;
    }

    elements.historyList.innerHTML = appState.evaluationHistory.slice(1).map((eval, index) => {
        const skipStep = eval.跳步判断 || {};
        const hasSkipStep = skipStep.是否跳步 || false;
        const evalNumber = appState.evaluationHistory.length - index - 1;

        return `
            <div class="history-item">
                <div class="evaluation-header">
                    <div class="score ${getScoreClass(eval.综合得分 || 3)}">${eval.综合得分 || 3}</div>
                    <div class="evaluation-title">评价 #${evalNumber}</div>
                    <div class="evaluation-time">${formatTime(eval.timestamp)}</div>
                </div>
                <div class="evaluation-content">
                    <strong>总体评价：</strong>${eval.总体评价 || '暂无评价'}
                </div>
                ${eval.建议 ? `
                    <div class="evaluation-suggestions">
                        <strong>建议：</strong>${eval.建议}
                    </div>
                ` : ''}
                ${hasSkipStep ? `
                    <div class="skip-step-warning small">
                        <span class="warning-icon">⚠️</span>
                        <strong>${skipStep.跳步类型 || '跳步'}</strong>
                        ${skipStep.督导建议 ? `<div class="skip-step-detail">${skipStep.督导建议}</div>` : ''}
                    </div>
                ` : `
                    <div class="skip-step-success small">
                        <span class="success-icon">✅</span>
                        节奏合适
                    </div>
                `}
            </div>
        </div>
        `;
    }).join('');
}

// 格式化时间
function formatTime(timestamp) {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

// 开始新的对话
async function startNewConversation() {
    if (appState.isProcessing) return;

    try {
        appState.isProcessing = true;
        updateStatus('正在建立新的对话...', 'processing');

        // 保存当前会话（如果有的话）
        if (appState.conversationStarted) {
            saveCurrentSession();
        }

        // 创建新会话
        const newSession = startNewSession();

        // 重置会话状态（保持对话会话历史）
        appState.visitorConversationId = null;  // 重置来访者会话ID
        appState.supervisorConversationId = null; // 重置督导会话ID
        appState.conversationStarted = false;
        appState.currentEvaluation = null;

        // 清空对话区域和评价历史
        elements.chatContainer.innerHTML = '';
        elements.evaluationContainer.innerHTML = '<div class="no-evaluation">暂无评价信息。开始对话后，督导会对你的回复进行评价。</div>';
        elements.historyList.innerHTML = '';

        appState.conversationHistory = [];
        appState.evaluationHistory = [];
        
        // 重置图表
        resetCharts();

        // 显示系统消息
        displayMessage('系统', `对话 #${appState.conversationSessions.indexOf(newSession) + 1} 已开始，来访者正在进入...`, 'system');

        // 调用来访者Agent获取初始消息（不使用会话ID，创建新会话）
        const initialMessage = await callVisitorAgent("你好，我是一名心理咨询师，很高兴认识你。请告诉我你今天想聊些什么？");

        // 显示来访者的第一条消息
        displayMessage('来访者', initialMessage, 'visitor');

        // 启用输入
        elements.userInput.disabled = false;
        elements.sendBtn.disabled = false;
        elements.startBtn.disabled = true;
        appState.conversationStarted = true;

        updateStatus('对话进行中 - 请回复来访者');

    } catch (error) {
        console.error('开始对话失败:', error);
        updateStatus('连接失败，请重试', 'error');
        displayMessage('系统', '连接来访者失败，请检查网络连接后重试。', 'system');
    } finally {
        appState.isProcessing = false;
    }
}

// 发送消息
async function sendMessage() {
    const message = elements.userInput.value.trim();
    if (!message || appState.isProcessing) return;

    try {
        appState.isProcessing = true;
        elements.sendBtn.disabled = true;
        elements.userInput.disabled = true;

        // 显示咨询师消息
        displayMessage('我', message, 'counselor');

        // 清空输入框
        elements.userInput.value = '';

        updateStatus('督导正在评价...', 'processing');

        // 调用督导Agent评价咨询师的回复
        const evaluation = await callSupervisorAgent(message);
        displayEvaluation(evaluation);

        updateStatus('来访者正在回复...', 'processing');

        // 调用来访者Agent获取回复
        const visitorResponse = await callVisitorAgent(message);
        displayMessage('来访者', visitorResponse, 'visitor');

        updateStatus('对话进行中 - 请回复来访者');

    } catch (error) {
        console.error('发送消息失败:', error);
        updateStatus('发送失败，请重试', 'error');
        displayMessage('系统', '消息发送失败，请重试。', 'system');
    } finally {
        appState.isProcessing = false;
        elements.sendBtn.disabled = false;
        elements.userInput.disabled = false;
        elements.userInput.focus();
    }
}


// 初始化函数
function initializeApp() {
    console.log('开始初始化应用...');

    // 检查DOM元素是否存在
    if (!elements.chatContainer) {
        console.error('chatContainer 元素未找到');
        return;
    }
    if (!elements.userInput) {
        console.error('userInput 元素未找到');
        return;
    }
    if (!elements.startBtn) {
        console.error('startBtn 元素未找到');
        return;
    }

    console.log('所有DOM元素已找到');

    // 加载对话历史
    loadConversationSessionsFromStorage();

    // 初始化界面
    updateStatus('准备就绪');
    
    // 初始化图表
    initCharts();

    // 隐藏对话历史面板
    if (elements.conversationHistory) {
        elements.conversationHistory.style.display = 'none';
    }

    // 绑定事件监听器
    if (elements.userInput) {
        elements.userInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!elements.sendBtn.disabled) {
                    sendMessage();
                }
            }
        });

        // 监听输入框变化
        elements.userInput.addEventListener('input', function() {
            console.log('输入框内容变化:', this.value);
        });

        elements.userInput.addEventListener('focus', function() {
            console.log('输入框获得焦点');
        });
    }

    console.log('心理咨询模拟系统初始化完成');
}

// 页面加载完成后的初始化
document.addEventListener('DOMContentLoaded', initializeApp);

// 确保在页面完全加载后也执行初始化
window.addEventListener('load', function() {
    console.log('页面完全加载');
    // 如果DOM加载时初始化失败，再次尝试
    if (!elements.userInput || !elements.chatContainer) {
        console.log('重新初始化...');
        setTimeout(initializeApp, 100);
    }
});

// ========== 对话历史记录功能 ==========

// 开始新的对话会话
function startNewSession() {
    const sessionId = Date.now().toString();
    appState.currentSessionId = sessionId;

    const session = {
        id: sessionId,
        startTime: new Date(),
        messages: [],
        evaluations: []
    };

    appState.conversationSessions.unshift(session);
    updateConversationHistoryList();
    return session;
}

// 保存当前会话到历史
function saveCurrentSession() {
    if (!appState.currentSessionId || !appState.conversationStarted) return;

    const session = appState.conversationSessions.find(s => s.id === appState.currentSessionId);
    if (session) {
        session.endTime = new Date();
        session.messages = [...appState.conversationHistory];
        session.evaluations = [...appState.evaluationHistory];
        session.duration = session.endTime - session.startTime;
    }

    updateConversationHistoryList();
    saveConversationSessionsToStorage();
}

// 切换对话历史显示
function toggleConversationHistory() {
    const historyContainer = elements.conversationHistory;
    const isVisible = historyContainer.style.display !== 'none';

    if (isVisible) {
        historyContainer.style.display = 'none';
        elements.historyToggleBtn.textContent = '📜 对话历史';
    } else {
        historyContainer.style.display = 'block';
        elements.historyToggleBtn.textContent = '📜 隐藏历史';
        updateConversationHistoryList();
    }
}

// 更新对话历史列表
function updateConversationHistoryList() {
    if (!elements.conversationHistoryList) return;

    if (appState.conversationSessions.length === 0) {
        elements.conversationHistoryList.innerHTML = '<div class="no-history">暂无对话历史记录</div>';
        return;
    }

    elements.conversationHistoryList.innerHTML = appState.conversationSessions.map((session, index) => {
        const isCurrentSession = session.id === appState.currentSessionId;
        const duration = session.duration ? formatDuration(session.duration) : '进行中';
        const messageCount = session.messages.length;
        const evalCount = session.evaluations.length;

        return `
            <div class="conversation-session ${isCurrentSession ? 'current' : ''}"
                 onclick="loadConversationSession('${session.id}')">
                <div class="session-header">
                    <div class="session-title">
                        对话 #${appState.conversationSessions.length - index}
                        ${isCurrentSession ? '<span class="current-badge">当前</span>' : ''}
                    </div>
                    <div class="session-meta">
                        ${formatDateTime(session.startTime)} • ${duration}
                        <br>
                        ${messageCount}条消息 • ${evalCount}个评价
                    </div>
                </div>
                ${evalCount > 0 ? `
                    <div class="session-evaluations">
                        <div class="session-score">
                            平均得分: ${calculateAverageScore(session.evaluations)}
                        </div>
                        ${hasSkipStepIssues(session.evaluations) ?
                            '<span class="skip-step-indicator">⚠️ 包含跳步问题</span>' :
                            '<span class="success-indicator">✅ 良好节奏</span>'
                        }
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

// 加载对话会话
function loadConversationSession(sessionId) {
    const session = appState.conversationSessions.find(s => s.id === sessionId);
    if (!session) return;

    // 确认切换会话
    if (appState.conversationStarted && !confirm('切换会话将清空当前对话，是否继续？')) {
        return;
    }

    // 保存当前会话
    if (appState.currentSessionId !== sessionId) {
        saveCurrentSession();
    }

    // 切换到新会话
    appState.currentSessionId = sessionId;
    appState.conversationHistory = [...session.messages];
    appState.evaluationHistory = [...session.evaluations];
    appState.visitorConversationId = null;
    appState.supervisorConversationId = null;

    // 重新加载对话内容
    reloadChatContainer();
    updateEvaluationHistory();
    updateConversationHistoryList();

    // 重置状态
    appState.conversationStarted = session.messages.length > 0;
    elements.userInput.disabled = !appState.conversationStarted;
    elements.sendBtn.disabled = !appState.conversationStarted;
}

// 重新加载聊天容器
function reloadChatContainer() {
    elements.chatContainer.innerHTML = '';

    if (appState.conversationHistory.length === 0) {
        elements.chatContainer.innerHTML = `
            <div class="welcome-message">
                欢迎使用心理咨询模拟系统。点击"开始新的对话"来开始练习。
            </div>
        `;
        return;
    }

    // 重新显示所有消息
    appState.conversationHistory.forEach(msg => {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${msg.type}`;
        messageDiv.innerHTML = `
            <div class="sender">${msg.sender}</div>
            <div class="content">${msg.content}</div>
        `;
        elements.chatContainer.appendChild(messageDiv);
    });

    elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
}

// 清空当前对话
function clearCurrentConversation() {
    if (appState.conversationStarted && !confirm('确定要清空当前对话吗？')) {
        return;
    }

    // 保存当前会话
    saveCurrentSession();

    // 清空当前对话
    elements.chatContainer.innerHTML = `
        <div class="welcome-message">
            对话已清空。点击"开始新的对话"来开始练习。
        </div>
    `;

    appState.conversationHistory = [];
    appState.evaluationHistory = [];
    appState.conversationStarted = false;
    appState.currentEvaluation = null;
    appState.visitorConversationId = null;
    appState.supervisorConversationId = null;

    // 清空评价显示
    elements.evaluationContainer.innerHTML = `
        <div class="no-evaluation">
            暂无评价信息。开始对话后，督导会对你的回复进行评价。
        </div>
    `;
    
    // 重置图表
    resetCharts();

    updateEvaluationHistory();

    // 禁用输入
    elements.userInput.disabled = true;
    elements.sendBtn.disabled = true;

    updateStatus('对话已清空', 'normal');
}

// 清空对话历史
function clearConversationHistory() {
    if (appState.conversationSessions.length === 0) {
        alert('暂无对话历史记录');
        return;
    }

    if (!confirm('确定要清空所有对话历史记录吗？此操作不可恢复！')) {
        return;
    }

    appState.conversationSessions = [];
    appState.currentSessionId = null;
    updateConversationHistoryList();
    saveConversationSessionsToStorage();

    // 清空历史列表显示
    elements.conversationHistoryList.innerHTML = '<div class="no-history">暂无对话历史记录</div>';

    updateStatus('对话历史已清空', 'normal');
}

// 导出对话历史
function exportConversationHistory() {
    // 导出前确保当前会话数据是最新的
    if (appState.currentSessionId && appState.conversationStarted) {
        saveCurrentSession();
    }

    if (appState.conversationSessions.length === 0) {
        alert('暂无对话历史记录可导出');
        return;
    }

    const exportData = {
        exportTime: new Date().toISOString(),
        sessions: appState.conversationSessions.map(session => ({
            id: session.id,
            startTime: session.startTime.toISOString(),
            endTime: session.endTime ? session.endTime.toISOString() : null,
            duration: session.duration,
            messageCount: session.messages.length,
            evaluationCount: session.evaluations.length,
            averageScore: calculateAverageScore(session.evaluations),
            hasSkipStepIssues: hasSkipStepIssues(session.evaluations),
            messages: session.messages,
            evaluations: session.evaluations
        }))
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `心理咨询对话记录_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    updateStatus('对话历史已导出', 'normal');
}

// ========== 工具函数 ==========

function extractJsonObjectFromText(text) {
    if (!text) return null;
    
    // 找到所有可能的JSON开始位置
    const matches = [];
    let startIndex = text.indexOf('{');
    
    while (startIndex !== -1) {
        let depth = 0;
        let inString = false;
        let escape = false;
        
        for (let i = startIndex; i < text.length; i++) {
            const ch = text[i];
            
            // 处理转义字符
            if (escape) {
                escape = false;
                continue;
            }
            
            if (ch === '\\') {
                escape = true;
                continue;
            }
            
            // 处理字符串
            if (ch === '"') {
                inString = !inString;
            }
            
            if (!inString) {
                if (ch === '{') {
                    depth++;
                } else if (ch === '}') {
                    depth--;
                    // 找到一个完整的JSON对象
                    if (depth === 0) {
                        const candidate = text.slice(startIndex, i + 1);
                        // 验证是否包含关键字段，避免提取到其他无关的括号内容
                        if (candidate.includes('"综合得分"') || 
                            candidate.includes('"总体评价"') || 
                            candidate.includes('"跳步判断"')) {
                            return candidate;
                        }
                        matches.push(candidate);
                        break; // 继续查找下一个可能的开始位置
                    }
                }
            }
        }
        
        // 查找下一个可能的开始位置
        startIndex = text.indexOf('{', startIndex + 1);
    }
    
    // 如果没有找到包含关键字段的JSON，返回最后一个提取到的完整对象（备选方案）
    return matches.length > 0 ? matches[matches.length - 1] : null;
}

// 计算平均得分
function calculateAverageScore(evaluations) {
    if (evaluations.length === 0) return 0;
    const totalScore = evaluations.reduce((sum, eval) => sum + (eval.综合得分 || 0), 0);
    return (totalScore / evaluations.length).toFixed(1);
}

// 检查是否有跳步问题
function hasSkipStepIssues(evaluations) {
    return evaluations.some(eval => {
        const skipStep = eval.跳步判断 || {};
        return skipStep.是否跳步 === true;
    });
}

// 格式化持续时间
function formatDuration(ms) {
    if (!ms) return '进行中';

    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
        return `${hours}小时${minutes % 60}分钟`;
    } else if (minutes > 0) {
        return `${minutes}分钟${seconds % 60}秒`;
    } else {
        return `${seconds}秒`;
    }
}

// 格式化日期时间
function formatDateTime(date) {
    const d = new Date(date);
    const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
    return `${d.getFullYear()}年${months[d.getMonth()]}${d.getDate()}日 ${formatTime(d)}`;
}

// ========== 图表功能 ==========

// 初始化图表
function initCharts() {
    if (!elements.stageChart || !window.Chart) return;

    // 通用配置
    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: {
                title: {
                    display: true,
                    text: '对话轮次'
                },
                ticks: {
                    stepSize: 1
                }
            }
        }
    };

    // 1. 对话阶段曲线
    appState.charts.stage = new Chart(elements.stageChart, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: '阶段 (1-4)',
                data: [],
                borderColor: '#3498db',
                backgroundColor: 'rgba(52, 152, 219, 0.2)',
                stepped: true, // 阶梯线
                tension: 0
            }]
        },
        options: {
            ...commonOptions,
            scales: {
                ...commonOptions.scales,
                y: {
                    min: 0,
                    max: 5,
                    ticks: {
                        stepSize: 1
                    },
                    title: { display: true, text: '阶段' }
                }
            }
        }
    });

    // 2. 情绪波动 (Timeline) - 使用散点图模拟或简单的点图
    // 由于是文本标签，我们用y轴固定值，在点上显示标签
    appState.charts.emotionTimeline = new Chart(elements.emotionTimelineChart, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: '情绪状态',
                data: [], // y值都设为1
                borderColor: '#9b59b6',
                backgroundColor: 'rgba(155, 89, 182, 0.2)',
                pointRadius: 6,
                pointHoverRadius: 8
            }]
        },
        options: {
            ...commonOptions,
            scales: {
                ...commonOptions.scales,
                y: {
                    display: false, // 隐藏Y轴
                    min: 0,
                    max: 2
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return '情绪: ' + context.raw.emotionLabel;
                        }
                    }
                }
            }
        }
    });

    // 3. 压力曲线
    appState.charts.stress = new Chart(elements.stressChart, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: '压力值 (0-1)',
                data: [],
                borderColor: '#e74c3c',
                backgroundColor: 'rgba(231, 76, 60, 0.2)',
                tension: 0.3,
                fill: true
            }]
        },
        options: {
            ...commonOptions,
            scales: {
                ...commonOptions.scales,
                y: {
                    min: 0,
                    max: 1,
                    title: { display: true, text: '压力值' }
                }
            }
        }
    });

    // 4. 情绪强度曲线
    appState.charts.emotionIntensity = new Chart(elements.emotionIntensityChart, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: '情绪效价 (-1 ~ 1)',
                data: [],
                borderColor: '#f1c40f',
                backgroundColor: 'rgba(241, 196, 15, 0.2)',
                tension: 0.3,
                fill: false
            }]
        },
        options: {
            ...commonOptions,
            scales: {
                ...commonOptions.scales,
                y: {
                    min: -1,
                    max: 1,
                    title: { display: true, text: '负面 <-> 正面' }
                }
            }
        }
    });
}

// 更新图表数据
function updateChartsData(data) {
    if (!data) return;
    
    // 解析数据
    // 假设API返回的是完整的历史数组，我们直接替换
    // 如果是增量，则需要判断。根据用户描述，似乎是返回数组。
    // 我们取数组长度作为轮次
    
    // 1. 对话阶段
    if (data.conversation_stage_curve && Array.isArray(data.conversation_stage_curve)) {
        const points = data.conversation_stage_curve;
        appState.chartsData.stage = points.map((p, i) => ({ x: i + 1, y: p.stage }));
        
        if (appState.charts.stage) {
            appState.charts.stage.data.labels = points.map((_, i) => `第${i+1}轮`);
            appState.charts.stage.data.datasets[0].data = appState.chartsData.stage;
            appState.charts.stage.update();
        }
    }

    // 2. 情绪波动 (Timeline)
    if (data.session_emotion_timeline && Array.isArray(data.session_emotion_timeline)) {
        const points = data.session_emotion_timeline;
        // 映射为点，y=1，存储label
        appState.chartsData.emotionTimeline = points.map((p, i) => ({
            x: i + 1,
            y: 1,
            emotionLabel: p.label
        }));

        if (appState.charts.emotionTimeline) {
            appState.charts.emotionTimeline.data.labels = points.map((_, i) => `第${i+1}轮`);
            appState.charts.emotionTimeline.data.datasets[0].data = appState.chartsData.emotionTimeline;
            appState.charts.emotionTimeline.update();
        }
    }

    // 3. 压力曲线
    if (data.stress_curve && Array.isArray(data.stress_curve)) {
        const points = data.stress_curve;
        appState.chartsData.stress = points.map((p, i) => ({ x: i + 1, y: p.value }));
        
        if (appState.charts.stress) {
            appState.charts.stress.data.labels = points.map((_, i) => `第${i+1}轮`);
            appState.charts.stress.data.datasets[0].data = appState.chartsData.stress;
            appState.charts.stress.update();
        }
    }

    // 4. 情绪强度
    if (data.emotion_curve && Array.isArray(data.emotion_curve)) {
        const points = data.emotion_curve;
        appState.chartsData.emotionIntensity = points.map((p, i) => ({ x: i + 1, y: p.value }));
        
        if (appState.charts.emotionIntensity) {
            appState.charts.emotionIntensity.data.labels = points.map((_, i) => `第${i+1}轮`);
            appState.charts.emotionIntensity.data.datasets[0].data = appState.chartsData.emotionIntensity;
            appState.charts.emotionIntensity.update();
        }
    }
}

// 重置图表
function resetCharts() {
    if (appState.charts.stage) {
        ['stage', 'emotionTimeline', 'stress', 'emotionIntensity'].forEach(key => {
            if (appState.charts[key]) {
                appState.charts[key].data.labels = [];
                appState.charts[key].data.datasets[0].data = [];
                appState.charts[key].update();
            }
        });
    }
}

// 保存对话会话到本地存储
function saveConversationSessionsToStorage() {
    try {
        const data = {
            sessions: appState.conversationSessions,
            lastSaved: new Date().toISOString()
        };
        localStorage.setItem('counselingSimulationSessions', JSON.stringify(data));
    } catch (error) {
        console.warn('无法保存对话历史到本地存储:', error);
    }
}

// 从本地存储加载对话会话
function loadConversationSessionsFromStorage() {
    try {
        const data = localStorage.getItem('counselingSimulationSessions');
        if (data) {
            const parsed = JSON.parse(data);
            if (parsed.sessions && Array.isArray(parsed.sessions)) {
                // 转换日期字符串回Date对象
                appState.conversationSessions = parsed.sessions.map(session => ({
                    ...session,
                    startTime: new Date(session.startTime),
                    endTime: session.endTime ? new Date(session.endTime) : null,
                    messages: session.messages || [],
                    evaluations: session.evaluations || []
                }));

                console.log('从本地存储加载了', appState.conversationSessions.length, '个对话会话');
            }
        }
    } catch (error) {
        console.warn('无法从本地存储加载对话历史:', error);
    }
}

// 监听页面关闭/刷新，保存当前进度
window.addEventListener('beforeunload', () => {
    if (appState.currentSessionId && appState.conversationStarted) {
        saveCurrentSession();
    }
});
