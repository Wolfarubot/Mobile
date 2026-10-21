import sys, wave, json, numpy as np
# Folds the reverb tail past the loop end back onto the start (seamless loop) and evens out loudness.
src, L, dst = sys.argv[1], float(sys.argv[2]), sys.argv[3]
w = wave.open(src); sr = w.getframerate(); ch = w.getnchannels()
x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float64).reshape(-1, ch) / 32768
n = round(L * sr)
if len(x) < n: x = np.vstack([x, np.zeros((n - len(x), ch))])
out = x[:n].copy(); tail = x[n:]
out[:len(tail)] += tail[:n]
rms = np.sqrt(np.mean(out ** 2))
out *= 10 ** (-19 / 20) / rms  # about -19 dBFS RMS
peak = np.max(np.abs(out))
if peak > 0.97: out = np.tanh(out / 0.97) * 0.97  # soft limit any peaks
y = (np.clip(out, -1, 1) * 32767).astype(np.int16)
o = wave.open(dst, 'wb'); o.setnchannels(ch); o.setsampwidth(2); o.setframerate(sr); o.writeframes(y.tobytes()); o.close()
print(f'{dst}: {n/sr:.3f}s rms {20*np.log10(rms):.1f}dB peak-after {20*np.log10(min(peak,0.97)):.1f}dB tail {len(tail)/sr:.1f}s')
