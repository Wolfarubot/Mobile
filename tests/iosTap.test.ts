import { expect, it } from 'vitest';
import { isIosWebKit } from '../src/ui/iosTap';

const nav = (userAgent: string, maxTouchPoints = 0) => ({ userAgent, maxTouchPoints }) as Navigator;

it('sends taps itself only on iPhone and iPad Safari', () => {
  expect(isIosWebKit(nav('Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1', 5))).toBe(true);
  // iPadOS asks for the desktop site: a Mac with a touch screen.
  expect(isIosWebKit(nav('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15', 5))).toBe(true);
  expect(isIosWebKit(nav('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15', 0))).toBe(false);
  expect(isIosWebKit(nav('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36', 5))).toBe(false);
  expect(isIosWebKit(nav('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36'))).toBe(false);
});
