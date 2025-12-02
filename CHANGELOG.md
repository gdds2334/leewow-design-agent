# Changelog

## 0.5.0 (2025-01-XX)

### Features
- **Clipboard Paste**: Support pasting images directly from clipboard (Ctrl+V) into the upload area.
- **Image Management**: Added ability to remove individual images from the upload list.
- **Cleanups**: Removed unused video editing features and assets.

## 0.4.0 (2025-01-XX)

### Features
- **Batch Generation**: Support uploading up to 20 subject images at once.
- **Queue Management**: Implemented a robust task queue with a concurrency limit of 12 requests (Analyze + Generate) to optimize performance and API usage.
- **Grouped Results**: Generated images are now grouped by their subject image in the UI and in the downloaded ZIP package.
- **Structured Download**: The "Download All" ZIP now contains separate folders for each subject image. Inside each folder, images are numbered sequentially starting from 0002.
- **Request Cancellation**: Automatically cancels pending requests when the user refreshes the page or navigates away.

## 0.3.0 (2025-01-XX)

### Features
- **Product Toggle**: Added enable/disable checkbox for each product. Only enabled products will be generated.
- **Local Storage Persistence**: Product configurations (names and enabled states) are now automatically saved to browser localStorage.
- **Frontend Direct API Calls**: Refactored to use frontend direct API calls instead of Vercel serverless functions.
- **Parallel Generation**: Enabled true parallel generation.
- **Extended Timeout**: Set API timeout to 10 minutes.

## 0.2.0 (2025-12-01)

### Features
- **Image Generation**: Fully integrated with Laozhang API `gemini-3-pro-image-preview`.
- **Base64 Support**: Added robust support for handling Base64 image data responses from the AI model.
- **Prompt Engineering**: Implemented split prompt strategy (Pattern + Scene) for higher quality results.
- **UI**: Added progress status, style reference (currently simplified), and result display.

### Fixes
- **API URL Extraction**: Fixed critical bug where non-HTTP image responses (Base64) caused generation failures.
- **Port Conflicts**: Added `restart_clean.sh` to manage development server ports automatically.
- **Image Optimization**: Implemented client-side compression to handle payload limits.



