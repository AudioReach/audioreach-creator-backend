#!/bin/bash
# clean-all.sh - Complete build cache cleanup for Unix/Linux/macOS

echo "🧹 Starting complete cache cleanup..."

# 1. Remove all TypeScript build outputs
echo "Removing TypeScript build artifacts..."
find . -name "dist" -type d -exec rm -rf {} + 2>/dev/null || true
find . -name "*.tsbuildinfo" -type f -delete 2>/dev/null || true
find . -name "*.d.ts.map" -type f -delete 2>/dev/null || true

# 2. Remove node_modules everywhere
echo "Removing all node_modules..."
find . -name "node_modules" -type d -exec rm -rf {} + 2>/dev/null || true

# 3. Clear package manager caches
echo "Clearing package manager caches..."
if command -v yarn &> /dev/null; then
    yarn cache clean 2>/dev/null || true
    echo "  Yarn cache cleared"
elif command -v npm &> /dev/null; then
    npm cache clean --force 2>/dev/null || true
    echo "  NPM cache cleared"
fi

# 4. Clear turbo cache
echo "Clearing turbo cache..."
if command -v npx &> /dev/null; then
    npx turbo clean 2>/dev/null || true
    echo "  Turbo cache cleared"
fi

# 5. Remove any .yarn/cache if it exists
echo "Removing Yarn cache directories..."
if [ -d ".yarn/cache" ]; then
    rm -rf .yarn/cache
    echo "  Removed .yarn/cache"
fi

# 6. Remove any package-lock.json files (in case switching between npm/yarn)
echo "Removing package-lock.json files..."
find . -name "package-lock.json" -type f -delete 2>/dev/null || true

# 7. Reinstall dependencies
echo "Reinstalling dependencies..."
if command -v yarn &> /dev/null; then
    yarn install
    echo "  Dependencies reinstalled with Yarn"
elif command -v npm &> /dev/null; then
    npm install
    echo "  Dependencies reinstalled with NPM"
else
    echo "  No package manager found!"
    exit 1
fi

echo "✅ Cleanup complete! Try building now."
echo "Run: yarn build or npm run build"
