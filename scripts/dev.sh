#!/bin/bash
# Start both portal and daemon in development mode
npx concurrently \
  --names "portal,daemon" \
  --prefix-colors "blue,green" \
  "npm run dev:portal" \
  "npm run dev:daemon"
