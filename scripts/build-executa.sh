#!/bin/bash

set -e

# Build script for Executa Tool binary distribution
# Creates platform-specific archives according to Anna binary distribution spec

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
EXECUTA_DIR="$PROJECT_ROOT/executas/summarizer"
DIST_DIR="$EXECUTA_DIR/dist"
ARCHIVES_DIR="$PROJECT_ROOT/dist/archives"

# Detect current platform
detect_platform() {
    local os=$(uname -s | tr '[:upper:]' '[:lower:]')
    local arch=$(uname -m)
    
    case "$os" in
        darwin)
            if [ "$arch" = "arm64" ]; then
                echo "darwin-arm64"
            else
                echo "darwin-x86_64"
            fi
            ;;
        linux)
            echo "linux-x86_64"
            ;;
        *)
            echo "unknown"
            ;;
    esac
}

PLATFORM=$(detect_platform)
echo "Building for platform: $PLATFORM"

# Create output directories
mkdir -p "$ARCHIVES_DIR"

# Build the TypeScript source to JavaScript
cd "$EXECUTA_DIR"
npm install --silent 2>/dev/null || true
npx tsc

# Create archive staging directory
STAGING_DIR="$ARCHIVES_DIR/staging-$PLATFORM"
rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR"

# Copy built files
cp "$DIST_DIR/index.js" "$STAGING_DIR/"
cp "$EXECUTA_DIR/manifest.json" "$STAGING_DIR/"

# Create runner script for the archive
cat > "$STAGING_DIR/run.sh" << 'RUNNER'
#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$SCRIPT_DIR/index.js" "$@"
RUNNER
chmod +x "$STAGING_DIR/run.sh"

# Determine archive format and name based on platform
case "$PLATFORM" in
    darwin-*)
        ARCHIVE_NAME="tool-dev-summarizer-${PLATFORM}.tar.gz"
        ARCHIVE_PATH="$ARCHIVES_DIR/$ARCHIVE_NAME"
        cd "$STAGING_DIR"
        tar -czf "$ARCHIVE_PATH" .
        ;;
    windows-*)
        ARCHIVE_NAME="tool-dev-summarizer-${PLATFORM}.zip"
        ARCHIVE_PATH="$ARCHIVES_DIR/$ARCHIVE_NAME"
        cd "$STAGING_DIR"
        zip -r "$ARCHIVE_PATH" .
        ;;
    linux-*)
        ARCHIVE_NAME="tool-dev-summarizer-${PLATFORM}.tar.gz"
        ARCHIVE_PATH="$ARCHIVES_DIR/$ARCHIVE_NAME"
        cd "$STAGING_DIR"
        tar -czf "$ARCHIVE_PATH" .
        ;;
    *)
        echo "Unknown platform: $PLATFORM"
        exit 1
        ;;
esac

echo "Created archive: $ARCHIVE_PATH"

# Verify archive contents
echo ""
echo "Archive contents:"
if [[ "$ARCHIVE_NAME" == *.tar.gz ]]; then
    tar -tzf "$ARCHIVE_PATH"
else
    unzip -l "$ARCHIVE_PATH"
fi

echo ""
echo "Build complete!"
