// 检测是否在Vercel环境中
const isVercel = process.env.VERCEL;

if (!isVercel) {
    // 本地开发环境 - 使用Express
    const express = require('express');
    const cors = require('cors');
    const { createProxyMiddleware } = require('http-proxy-middleware');

    const app = express();
    const PORT = 3000;

    // 启用CORS
    app.use(cors({
        origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'file://', 'null'],
        credentials: true
    }));

    // 代理Dify API请求
    app.use('/api', createProxyMiddleware({
        target: 'http://dify.ai-role.cn',
        changeOrigin: true,
        secure: false,
        pathRewrite: {
            '^/api': '/v1'
        },
        onProxyReq: (proxyReq, req, res) => {
            console.log('代理请求:', req.method, req.url);
            console.log('Authorization头:', req.headers.authorization);

            // 确保Authorization头被正确传递
            if (req.headers.authorization) {
                proxyReq.setHeader('Authorization', req.headers.authorization);
            }

            // 设置其他必要的头
            proxyReq.setHeader('Content-Type', 'application/json');
            proxyReq.setHeader('Accept', 'application/json');
        },
        onProxyRes: (proxyRes, req, res) => {
            console.log('代理响应状态:', proxyRes.statusCode, req.url);
            console.log('响应头:', proxyRes.headers);
        },
        onError: (err, req, res) => {
            console.error('代理错误:', err);
            res.status(500).json({
                error: '代理服务器错误',
                message: err.message,
                url: req.url
            });
        }
    }));

    // 静态文件服务
    app.use(express.static(__dirname));

    app.listen(PORT, () => {
        console.log(`代理服务器运行在 http://localhost:${PORT}`);
        console.log('请访问 http://localhost:3000/index.html');
    });
} else {
    // Vercel无服务器函数
    module.exports = async (req, res) => {
        try {
            // 启用CORS
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

            if (req.method === 'OPTIONS') {
                res.status(200).end();
                return;
            }

            // 处理API请求
            if (req.url && req.url.startsWith('/api/')) {
                // 构建正确的目标URL
                const pathPart = req.url.replace('/api', '');
                const targetUrl = `http://dify.ai-role.cn/v1${pathPart}`;

                console.log('Vercel代理请求:', req.method, targetUrl);

                // 准备请求头
                const headers = {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': req.headers.authorization || ''
                };

                // 准备请求体
                let body = undefined;
                if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
                    body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
                }

                // 使用node-fetch进行请求
                const fetch = require('node-fetch');

                const response = await fetch(targetUrl, {
                    method: req.method,
                    headers: headers,
                    body: body
                });

                // 获取响应内容类型
                const contentType = response.headers.get('content-type');
                let responseData;

                if (contentType && contentType.includes('application/json')) {
                    responseData = await response.json();
                } else {
                    responseData = await response.text();
                }

                console.log('Vercel代理响应状态:', response.status);

                // 设置响应头并返回
                res.setHeader('Content-Type', contentType || 'application/json');
                res.status(response.status);

                if (typeof responseData === 'object') {
                    res.json(responseData);
                } else {
                    res.send(responseData);
                }

            } else {
                // 非API请求返回404，静态文件会由Vercel自动处理
                res.status(404).json({ error: 'Not found' });
            }
        } catch (error) {
            console.error('Vercel函数错误:', error);
            res.status(500).json({
                error: '服务器内部错误',
                message: error.message
            });
        }
    };
}