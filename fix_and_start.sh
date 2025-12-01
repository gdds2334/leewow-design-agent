#!/bin/bash
echo "Cleaning up..."
rm -rf .next
rm -rf node_modules

echo "Installing dependencies..."
npm install

echo "Ensuring autoprefixer is installed..."
npm install autoprefixer --save-dev

echo "Starting server..."
npm run dev



