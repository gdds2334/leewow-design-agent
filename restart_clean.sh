#!/bin/bash
echo "Creating .env.local with API Key..."
echo "LAOZHANG_API_KEY=sk-RrmUCHLK823BWXbK1bD6Bf19DaB34dCf9c0924E03f0392Ad" > .env.local

echo "Stopping all Node.js processes to free up ports..."
pkill -f node

echo "Waiting for ports to clear..."
sleep 2

echo "Starting server on port 3000..."
npm run dev
