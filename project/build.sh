#!/bin/bash
#
# Neptun-Lite Build Script
# Compiles the project into the dist/ folder
#
# Usage: ./build.sh
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=================================================="
echo "Neptun-Lite Build Script"
echo "=================================================="
echo ""

# Check if PHP is installed
if ! command -v php &> /dev/null; then
    echo "❌ Error: PHP is not installed."
    echo "   Please install PHP: sudo apt install php-cli"
    exit 1
fi

# Check if build.php exists
if [ ! -f "build.php" ]; then
    echo "❌ Error: build.php not found."
    echo "   Make sure you're running this script from the project root."
    exit 1
fi

# Clean dist folder
echo "🧹 Cleaning dist/ folder..."
if [ -d "dist" ]; then
    rm -rf dist
    echo "   ✓ dist/ removed"
fi

# Run build
echo ""
echo "🔨 Building project..."
echo ""
php build.php

# Verify build
echo ""
echo "🔍 Verifying build..."

if [ ! -d "dist" ]; then
    echo "❌ Error: dist/ folder was not created."
    exit 1
fi

if [ ! -f "dist/index.html" ]; then
    echo "❌ Error: dist/index.html not found."
    exit 1
fi

if [ ! -f "dist/manifest.json" ]; then
    echo "❌ Error: dist/manifest.json not found."
    exit 1
fi

if [ ! -f "dist/sw.min.js" ]; then
    echo "❌ Error: dist/sw.min.js not found."
    exit 1
fi

# Count files
FILE_COUNT=$(find dist -type f | wc -l)
TOTAL_SIZE=$(du -sh dist | cut -f1)

echo ""
echo "=================================================="
echo "✓ Build Complete!"
echo "=================================================="
echo "   Output:  dist/"
echo "   Files:   $FILE_COUNT"
echo "   Size:    $TOTAL_SIZE"
echo ""
echo "   To deploy, upload the contents of dist/ to your web server."
echo "=================================================="
