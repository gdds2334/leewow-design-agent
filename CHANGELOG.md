# Changelog

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



