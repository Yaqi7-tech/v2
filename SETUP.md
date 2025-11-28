# 心理咨询模拟系统 - 安装和使用指南

## 问题解决方案

为了解决CORS跨域问题，我们使用了一个本地代理服务器来转发API请求。

## 安装步骤

### 1. 安装Node.js依赖
```bash
npm install
```

### 2. 启动代理服务器
```bash
npm start
```
或
```bash
node proxy-server.js
```

### 3. 访问应用
打开浏览器访问：`http://localhost:3000/index.html`

## 系统架构

```
浏览器 --> 本地代理服务器(3000) --> Dify API服务器
```

- 本地代理服务器解决了CORS跨域问题
- 保持了会话连续性和记忆功能
- 支持真实的Dify API调用

## 功能特点

1. **真实API集成**：使用你的Dify API密钥和端点
2. **会话连续性**：每个Agent保持独立的对话记忆
3. **实时督导评价**：督导Agent对每条回复进行评价
4. **完全本地运行**：数据不会经过第三方服务器

## 文件说明

- `proxy-server.js` - 代理服务器，解决CORS问题
- `script.js` - 前端逻辑，集成真实API
- `index.html` - 用户界面
- `styles.css` - 样式文件
- `package.json` - Node.js依赖配置

## 故障排除

### 1. 端口被占用
如果3000端口被占用，修改 `proxy-server.js` 中的PORT变量

### 2. API连接失败
- 检查API密钥是否正确
- 检查网络连接
- 查看代理服务器控制台日志

### 3. Node.js未安装
从 https://nodejs.org 下载并安装Node.js

## 注意事项

1. 代理服务器必须保持运行状态
2. 每次修改配置后需要重启服务器
3. 确保API密钥正确且有权限访问相应的Dify工作流