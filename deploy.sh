#!/bin/bash

# Deployment Script for Order Converter
# Usage: ./deploy.sh [host]

HOST=$1

if [ -z "$HOST" ]; then
    echo "Usage: ./deploy.sh [user@host]"
    exit 1
fi

echo "🚀 Deploying to $HOST..."

# 1. Sync files to the server
echo "📂 Syncing files..."
rsync -avz --exclude 'node_modules' --exclude '.git' --exclude '.next' \
    ./Dockerfile ./docker-compose.yml ./next.config.ts ./package.json ./package-lock.json \
    ./app ./components ./db ./lib ./public ./scripts ./styles \
    $HOST:/home/ubuntu/app

# 2. Run remote commands
echo "🔄 Rebuilding and restarting containers..."
ssh $HOST << 'EOF'
    cd /home/ubuntu/app
    
    # Ensure .env exists (should be set up manually once for security)
    if [ ! -f .env ]; then
        echo "⚠️  .env file missing! Creating default..."
        echo "POSTGRES_USER=admin" > .env
        echo "POSTGRES_PASSWORD=changeme" >> .env
        echo "POSTGRES_DB=orderdb" >> .env
        echo "GOOGLE_API_KEY=YOUR_API_KEY_HERE" >> .env
        echo "NEXT_PUBLIC_APP_URL=http://$HOST:3000" >> .env
        echo "⚠️  REMINDER: Edit .env on the server to set your real GOOGLE_API_KEY!"
    fi

    # Build and Start
    docker-compose up -d --build
    
    # Clean up unused images
    docker image prune -f
EOF

echo "✅ Deployment complete!"
