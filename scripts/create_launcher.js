import fs from 'fs';
import path from 'path';

const desktopPath = "C:\\Users\\LAMBDAXII\\Desktop";

// Fixed BAT Content for old icon
const batContent = `@echo off
chcp 65001 >nul
title 甘肃电力现货交易驾驶舱 - 数据更新工具
echo ========================================================
echo       甘肃电力现货交易驾驶舱 - 数据更新工具
echo ========================================================
echo.
echo [1/2] 正在解析最新 Excel 数据，请稍候...
cd /d "D:\\yangyang\\甘肃\\数据\\power-trading-dashboard"
node scripts/parse_data.js

if %errorlevel% neq 0 (
    echo.
    echo [错误] 数据解析失败！请检查 Excel 文件格式。
    pause
    exit /b
)

echo.
echo [2/2] 数据解析成功！正在启动网页服务...
start http://localhost:5173/
cmd /c npm run dev
`;

// VBS Content
const vbsContent = `Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c ""cd /d D:\\yangyang\\甘肃\\数据\\power-trading-dashboard && node scripts/parse_data.js""", 1, True
WshShell.Run "cmd /c start http://localhost:5173/", 0, False
WshShell.Run "cmd /c ""cd /d D:\\yangyang\\甘肃\\数据\\power-trading-dashboard && npm run dev""", 0, False
`;

// Write/Fix files on desktop
fs.writeFileSync(path.join(desktopPath, "更新数据并启动大屏.bat"), batContent, 'utf8');
fs.writeFileSync(path.join(desktopPath, "一键更新并启动大屏.bat"), batContent, 'utf8');
fs.writeFileSync(path.join(desktopPath, "一键更新并启动大屏.vbs"), vbsContent, 'utf16le');

console.log("All desktop icons updated and fixed!");
