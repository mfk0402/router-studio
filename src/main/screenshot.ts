import { desktopCapturer, screen, BrowserWindow, nativeImage } from 'electron';

/**
 * Capture all screens and return them as base64 PNG data URLs.
 * Returns an array of { id, name, dataUrl, width, height } for each source.
 */
export async function captureAllScreens(): Promise<
  Array<{
    id: string;
    name: string;
    dataUrl: string;
    width: number;
    height: number;
  }>
> {
  const displays = screen.getAllDisplays();
  const primaryDisplay = screen.getPrimaryDisplay();

  // Get all screen sources
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: primaryDisplay.workAreaSize.width,
      height: primaryDisplay.workAreaSize.height,
    },
  });

  const results: Array<{
    id: string;
    name: string;
    dataUrl: string;
    width: number;
    height: number;
  }> = [];

  for (const source of sources) {
    // Find matching display for this source
    const displayIndex = sources.indexOf(source);
    const display = displays[displayIndex] || primaryDisplay;

    const thumbnail = source.thumbnail;
    if (thumbnail && !thumbnail.isEmpty()) {
      results.push({
        id: source.id,
        name: source.name,
        dataUrl: thumbnail.toDataURL(),
        width: display.bounds.width,
        height: display.bounds.height,
      });
    }
  }

  return results;
}

/**
 * Capture a specific region of the screen.
 * @param x - X coordinate (from primary display origin)
 * @param y - Y coordinate (from primary display origin)
 * @param width - Width of the region
 * @param height - Height of the region
 * @returns Base64 PNG data URL of the cropped region
 */
export async function captureRegion(
  x: number,
  y: number,
  width: number,
  height: number,
): Promise<string> {
  const primaryDisplay = screen.getPrimaryDisplay();

  // Get screen source with full resolution
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: primaryDisplay.workAreaSize.width * primaryDisplay.scaleFactor,
      height: primaryDisplay.workAreaSize.height * primaryDisplay.scaleFactor,
    },
  });

  if (sources.length === 0) {
    throw new Error('No screen sources available');
  }

  const source = sources[0];
  const thumbnail = source.thumbnail;

  if (!thumbnail || thumbnail.isEmpty()) {
    throw new Error('Failed to capture screen');
  }

  // Scale coordinates for high-DPI displays
  const scaleFactor = primaryDisplay.scaleFactor;
  const scaledX = Math.round(x * scaleFactor);
  const scaledY = Math.round(y * scaleFactor);
  const scaledWidth = Math.round(width * scaleFactor);
  const scaledHeight = Math.round(height * scaleFactor);

  // Crop the image to the selected region
  const cropped = thumbnail.crop({
    x: scaledX,
    y: scaledY,
    width: scaledWidth,
    height: scaledHeight,
  });

  // Resize back to logical pixels if needed
  const resized = cropped.resize({
    width: Math.round(width),
    height: Math.round(height),
    quality: 'best',
  });

  return resized.toDataURL();
}

/**
 * Capture the full primary screen.
 * @returns Base64 PNG data URL
 */
export async function captureFullScreen(): Promise<string> {
  const primaryDisplay = screen.getPrimaryDisplay();

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: primaryDisplay.workAreaSize.width,
      height: primaryDisplay.workAreaSize.height,
    },
  });

  if (sources.length === 0) {
    throw new Error('No screen sources available');
  }

  const source = sources[0];
  const thumbnail = source.thumbnail;

  if (!thumbnail || thumbnail.isEmpty()) {
    throw new Error('Failed to capture screen');
  }

  return thumbnail.toDataURL();
}
