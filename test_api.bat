@echo off
echo === Health Check ===
curl -s http://127.0.0.1:3001/api/health
echo.

echo === POST valid note ===
curl -s -w "\nHTTP_STATUS:%%{http_code}\n" -X POST http://127.0.0.1:3001/api/notes -H "Content-Type: application/json" -d "{\"title\":\"Team connection test\"}"
echo.

echo === POST empty/whitespace title ===
curl -s -w "\nHTTP_STATUS:%%{http_code}\n" -X POST http://127.0.0.1:3001/api/notes -H "Content-Type: application/json" -d "{\"title\":\"   \"}"
echo.

echo === POST 121-char title ===
curl -s -w "\nHTTP_STATUS:%%{http_code}\n" -X POST http://127.0.0.1:3001/api/notes -H "Content-Type: application/json" -d "{\"title\":\"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\"}"
echo.

echo === GET all notes ===
curl -s http://127.0.0.1:3001/api/notes
echo.
