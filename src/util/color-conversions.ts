/**
 * Convert an RGB array to an HSV array.
 * @param rgb - Input [r, g, b] array (0-255 each).
 * @param hsv - Output [h, s, v] array, h: 0-360, s: 0-1, v: 0-1.
 * @returns The hsv output array.
 */
function rgbToHsv(rgb: number[], hsv: number[]): number[] {
  const r = rgb[0] / 255;
  const g = rgb[1] / 255;
  const b = rgb[2] / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  hsv[2] = max;

  if (max === 0) {
    hsv[1] = 0;
  } else {
    hsv[1] = d / max;
  }

  if (d === 0) {
    hsv[0] = 0;
  } else {
    switch (max) {
      case r:
        hsv[0] = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        hsv[0] = ((b - r) / d + 2) / 6;
        break;
      case b:
        hsv[0] = ((r - g) / d + 4) / 6;
        break;
    }
    hsv[0] *= 360;
  }

  return hsv;
}

/**
 * Convert an HSV array to an RGB array.
 * @param hsv - Input [h, s, v] array, h: 0-360, s: 0-1, v: 0-1.
 * @param rgb - Output [r, g, b] array (0-255 each).
 * @returns The rgb output array.
 */
function hsvToRgb(hsv: number[], rgb: number[]): number[] {
  const h = (hsv[0] % 360) / 60;
  const s = hsv[1];
  const v = hsv[2];

  const i = Math.floor(h);
  const f = h - i;
  const p = v * (1 - s);
  const q = v * (1 - s * f);
  const t = v * (1 - s * (1 - f));

  let r: number, g: number, b: number;
  switch (i) {
    case 0:
      r = v;
      g = t;
      b = p;
      break;
    case 1:
      r = q;
      g = v;
      b = p;
      break;
    case 2:
      r = p;
      g = v;
      b = t;
      break;
    case 3:
      r = p;
      g = q;
      b = v;
      break;
    case 4:
      r = t;
      g = p;
      b = v;
      break;
    case 5:
    default:
      r = v;
      g = p;
      b = q;
      break;
  }

  rgb[0] = Math.round(r * 255);
  rgb[1] = Math.round(g * 255);
  rgb[2] = Math.round(b * 255);

  return rgb;
}

export { rgbToHsv, hsvToRgb };
