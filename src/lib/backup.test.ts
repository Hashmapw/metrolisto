import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Capacitor } from '@capacitor/core';
import { Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { downloadBackup } from './backup';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: vi.fn() } }));
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: { writeFile: vi.fn() },
  Directory: { Cache: 'CACHE' },
  Encoding: { UTF8: 'utf8' },
}));
vi.mock('@capacitor/share', () => ({ Share: { share: vi.fn() } }));

beforeEach(() => vi.resetAllMocks());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('backup export', () => {
  it('shares a UTF-8 cache file on native platforms and awaits the share result', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(Filesystem.writeFile).mockResolvedValue({ uri: 'file:///cache/backup.json' });
    let finish!: (value: { activityType: string }) => void;
    vi.mocked(Share.share).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const complete = vi.fn();
    const pending = downloadBackup('{"城市":"北京"}', 'backup.json').then(complete);
    await vi.waitFor(() =>
      expect(Share.share).toHaveBeenCalledWith(
        expect.objectContaining({ files: ['file:///cache/backup.json'] }),
      ),
    );
    expect(Filesystem.writeFile).toHaveBeenCalledWith({
      path: 'backup.json',
      data: '{"城市":"北京"}',
      directory: 'CACHE',
      encoding: 'utf8',
    });
    expect(complete).not.toHaveBeenCalled();
    finish({ activityType: 'save' });
    await pending;
    expect(complete).toHaveBeenCalledWith('native');
  });
  it('propagates write errors and canceled sharing instead of reporting success', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(Filesystem.writeFile).mockRejectedValueOnce(new Error('Disk full'));
    await expect(downloadBackup('{}')).rejects.toThrow('Disk full');
    expect(Share.share).not.toHaveBeenCalled();
    vi.mocked(Filesystem.writeFile).mockResolvedValue({ uri: 'file:///cache/backup.json' });
    vi.mocked(Share.share).mockRejectedValue(new Error('Share canceled'));
    await expect(downloadBackup('{}')).rejects.toThrow('Share canceled');
  });
  it('downloads original recovery contents unchanged on the web and releases the URL', async () => {
    vi.useFakeTimers();
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    const link = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
    const createObjectURL = vi.fn(() => 'blob:backup');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    vi.stubGlobal('document', { createElement: () => link, body: { appendChild: vi.fn() } });
    expect(await downloadBackup('{broken', 'recovery.json')).toBe('web');
    expect(await (createObjectURL.mock.calls[0] as unknown as [Blob])[0].text()).toBe('{broken');
    expect(link.download).toBe('recovery.json');
    expect(link.click).toHaveBeenCalled();
    expect(link.remove).toHaveBeenCalled();
    expect(Filesystem.writeFile).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:backup');
  });
});
