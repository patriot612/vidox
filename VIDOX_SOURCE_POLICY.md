# VidoX source policy

Supported sources:
- TikTok
- Instagram Reels
- YouTube Shorts only

YouTube long-form/watch URLs are not supported.

Download behavior:
- Download the best publicly available video/audio combination.
- Prefer public watermark-free renditions when the extractor provides them.
- Never bypass private accounts, login walls, or access controls.
- Do not intentionally re-encode video; FFmpeg is used only for lossless MP4 remux/faststart when needed.
- Temporary files are deleted after delivery.
